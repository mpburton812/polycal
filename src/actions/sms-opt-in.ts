"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { type ActionResult } from "@/lib/actions/result";
import { logUserActivity } from "@/lib/audit";
import { isAdultBirthdate } from "@/lib/brand/age-gate";
import { formatPhoneForStorage, normalizePhoneDigits, phonesMatch } from "@/lib/brand/phone";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  parseNotificationPrefs,
  type NotificationPrefs,
} from "@/types/notification-prefs";

const publicOptInSchema = z.object({
  phone: z.string().min(1).max(32),
  consent: z.literal(true),
  birthYear: z.number().int(),
  birthMonth: z.number().int(),
  birthDay: z.number().int(),
  sourcePath: z.string().max(200).default("/sms-opt-in"),
});

/**
 * Applies SMS opt-in to a user row: phone + channels.sms + consent audit (PC-494).
 */
async function applySmsOptInToUser(
  userId: string,
  phoneStored: string,
  sourcePath: string,
  prefsJson: string | null | undefined,
): Promise<void> {
  const prefs: NotificationPrefs = {
    ...parseNotificationPrefs(prefsJson),
    channels: {
      ...parseNotificationPrefs(prefsJson).channels,
      sms: true,
    },
  };
  const now = new Date().toISOString();
  const db = getDb();
  await db
    .update(users)
    .set({
      notificationPhone: phoneStored,
      notificationPrefsJson: JSON.stringify(prefs),
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await logUserActivity(
    userId,
    "profile.sms_opt_in",
    JSON.stringify({ phone: phoneStored, sourcePath, consentedAt: now }),
  );
}

/**
 * Public Telnyx-style SMS opt-in (PC-494). Requires 18+ birthdate and explicit consent.
 * Updates the signed-in user, or a matching profile phone when signed out.
 */
export async function submitPublicSmsOptInAction(input: {
  phone: string;
  consent: boolean;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  sourcePath?: string;
}): Promise<ActionResult & { message: string }> {
  const parsed = publicOptInSchema.safeParse({
    ...input,
    consent: input.consent === true ? true : undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "Complete phone, consent, and birthdate to opt in." };
  }

  if (
    !isAdultBirthdate(parsed.data.birthYear, parsed.data.birthMonth, parsed.data.birthDay)
  ) {
    return { ok: false, message: "You must be 18 or older to opt in to SMS." };
  }

  const phoneStored = formatPhoneForStorage(parsed.data.phone);
  if (!phoneStored) {
    return { ok: false, message: "Enter a valid mobile phone number." };
  }

  const ipKey = normalizePhoneDigits(phoneStored);
  if (!checkRateLimit(`sms-opt-in:${ipKey}`, 5, 60_000)) {
    return { ok: false, message: "Too many attempts. Try again in a minute." };
  }

  await ensureDbReady();
  const db = getDb();
  const session = await auth();

  if (session?.user?.id) {
    const [row] = await db
      .select({
        id: users.id,
        notificationPrefsJson: users.notificationPrefsJson,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (!row) {
      return { ok: false, message: "Account not found." };
    }
    await applySmsOptInToUser(
      row.id,
      phoneStored,
      parsed.data.sourcePath,
      row.notificationPrefsJson,
    );
    return {
      ok: true,
      message: "SMS opt-in saved. You can change this anytime in Profile.",
    };
  }

  const candidates = await db
    .select({
      id: users.id,
      notificationPhone: users.notificationPhone,
      notificationPrefsJson: users.notificationPrefsJson,
    })
    .from(users)
    .limit(500);

  const match = candidates.find((row) => phonesMatch(row.notificationPhone, phoneStored));
  if (!match) {
    return {
      ok: false,
      message:
        "No PolyCal profile matches that phone yet. Sign in and add your number under Profile → Notifications, or ask your administrator to provision your account first.",
    };
  }

  await applySmsOptInToUser(
    match.id,
    phoneStored,
    parsed.data.sourcePath,
    match.notificationPrefsJson,
  );
  return {
    ok: true,
    message: "SMS opt-in saved for your PolyCal profile.",
  };
}

/**
 * Profile SMS phone + optional consent toggle (PC-494). Consent must be checked to enable SMS.
 */
export async function updateSmsNotificationSettingsAction(input: {
  phone: string;
  smsEnabled: boolean;
  consentChecked: boolean;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Not signed in." };
  }

  const phoneRaw = input.phone.trim();
  let phoneStored: string | null = null;
  if (phoneRaw) {
    phoneStored = formatPhoneForStorage(phoneRaw);
    if (!phoneStored) {
      return { ok: false, message: "Enter a valid mobile phone number." };
    }
  }

  if (input.smsEnabled && !input.consentChecked) {
    return {
      ok: false,
      message: "Check the SMS consent box to enable SMS alerts.",
    };
  }
  if (input.smsEnabled && !phoneStored) {
    return { ok: false, message: "Enter a mobile phone number to enable SMS." };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({ notificationPrefsJson: users.notificationPrefsJson })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const prefs = parseNotificationPrefs(row?.notificationPrefsJson);
  const nextPrefs: NotificationPrefs = {
    ...prefs,
    channels: { ...prefs.channels, sms: Boolean(input.smsEnabled && input.consentChecked) },
  };
  const now = new Date().toISOString();

  await db
    .update(users)
    .set({
      notificationPhone: phoneStored,
      notificationPrefsJson: JSON.stringify(nextPrefs),
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  if (nextPrefs.channels.sms) {
    await logUserActivity(
      session.user.id,
      "profile.sms_opt_in",
      JSON.stringify({
        phone: phoneStored,
        sourcePath: "/profile",
        consentedAt: now,
      }),
    );
  } else if (prefs.channels.sms) {
    await logUserActivity(
      session.user.id,
      "profile.sms_opt_out",
      JSON.stringify({ sourcePath: "/profile", at: now }),
    );
  }

  return { ok: true };
}
