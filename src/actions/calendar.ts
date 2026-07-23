"use server";

/**
 * Calendar integration server actions (PC-338–PC-341).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { logUserActivity } from "@/lib/audit";
import { requireSession, type SessionUser } from "@/lib/actions/context";
import {
  isCalendarEncryptionConfigured,
  encryptSecret,
  decryptSecret,
} from "@/lib/calendar/crypto";
import { listWritableGoogleCalendars } from "@/lib/calendar/google-api";
import {
  buildGoogleAuthorizeUrl,
  isGoogleCalendarConfigured,
  refreshGoogleAccessToken,
} from "@/lib/calendar/google-oauth";
import type { IcsDeliveryMode } from "@/lib/calendar/types";
import { icsDeliveryModes, GOOGLE_OAUTH_STATE_COOKIE } from "@/lib/calendar/types";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { calendarConnections, calendarIcsPending } from "@/lib/db/schema";

const icsDeliverySchema = z.enum(icsDeliveryModes);

export type CalendarConnectionView = {
  configured: boolean;
  provider: "google" | "ics" | null;
  status: "active" | "needs_reconnect" | null;
  googleCalendarId: string | null;
  googleAccountEmail: string | null;
  icsDelivery: IcsDeliveryMode | null;
  googleConfigured: boolean;
  encryptionConfigured: boolean;
};

export type PendingIcsView = {
  id: string;
  proposalId: string;
  title: string;
  filename: string;
  method: string;
  createdAt: string;
};

async function requireUser(): Promise<SessionUser> {
  const session = await requireSession();
  if (!session.ok) {
    throw new Error(session.message);
  }
  return session.user;
}

/**
 * Returns the current user's calendar connection + feature flags for Profile UI.
 */
export async function getCalendarConnectionAction(): Promise<CalendarConnectionView> {
  const user = await requireUser();
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, user.id))
    .limit(1);

  const flags = {
    googleConfigured: isGoogleCalendarConfigured() && isCalendarEncryptionConfigured(),
    encryptionConfigured: isCalendarEncryptionConfigured(),
  };

  if (!row) {
    return {
      configured: false,
      provider: null,
      status: null,
      googleCalendarId: null,
      googleAccountEmail: null,
      icsDelivery: null,
      ...flags,
    };
  }

  return {
    configured: true,
    provider: row.provider,
    status: row.status,
    googleCalendarId: row.googleCalendarId,
    googleAccountEmail: row.googleAccountEmail,
    icsDelivery: (row.icsDelivery as IcsDeliveryMode | null) ?? null,
    ...flags,
  };
}

/**
 * Starts Google OAuth by setting a CSRF state cookie and returning the authorize URL.
 */
export async function beginGoogleCalendarConnectAction(): Promise<
  { ok: true; url: string } | { ok: false; message: string }
> {
  try {
    const user = await requireUser();
    if (!isGoogleCalendarConfigured()) {
      return { ok: false, message: "Google Calendar is not configured on this server." };
    }
    if (!isCalendarEncryptionConfigured()) {
      return { ok: false, message: "Calendar token encryption key is not configured." };
    }

    const state = randomBytes(24).toString("base64url");
    const jar = await cookies();
    jar.set(GOOGLE_OAUTH_STATE_COOKIE, `${user.id}:${state}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });

    return { ok: true, url: buildGoogleAuthorizeUrl(`${user.id}:${state}`) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Sign in required." };
  }
}

/**
 * Saves the chosen Google calendar id after OAuth connect.
 */
export async function setGoogleCalendarIdAction(
  calendarId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    const id = calendarId.trim();
    if (!id) return { ok: false, message: "Choose a calendar." };

    await ensureDbReady();
    const db = getDb();
    const [row] = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, user.id))
      .limit(1);

    if (!row || row.provider !== "google") {
      return { ok: false, message: "Connect Google Calendar first." };
    }

    await db
      .update(calendarConnections)
      .set({
        googleCalendarId: id,
        status: "active",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(calendarConnections.id, row.id));

    await logUserActivity(
      user.id,
      "calendar.google_calendar_selected",
      JSON.stringify({ calendarId: id }),
    );
    revalidatePath("/profile");
    return { ok: true, message: "Google Calendar connected." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed." };
  }
}

/**
 * Lists writable Google calendars for the connected account.
 */
export async function listGoogleCalendarsAction(): Promise<
  | { ok: true; calendars: { id: string; summary: string; primary?: boolean }[] }
  | { ok: false; message: string }
> {
  try {
    const user = await requireUser();
    await ensureDbReady();
    const db = getDb();
    const [row] = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, user.id))
      .limit(1);

    if (!row?.googleRefreshTokenEnc) {
      return { ok: false, message: "Connect Google Calendar first." };
    }

    try {
      const refreshToken = decryptSecret(row.googleRefreshTokenEnc);
      const tokens = await refreshGoogleAccessToken(refreshToken);
      const calendars = await listWritableGoogleCalendars(tokens.access_token);
      const updatedAt = new Date().toISOString();
      await db
        .update(calendarConnections)
        .set({
          googleAccessTokenEnc: encryptSecret(tokens.access_token),
          googleTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          status: "active",
          updatedAt,
        })
        .where(eq(calendarConnections.id, row.id));
      return { ok: true, calendars };
    } catch {
      await db
        .update(calendarConnections)
        .set({ status: "needs_reconnect", updatedAt: new Date().toISOString() })
        .where(eq(calendarConnections.id, row.id));
      return { ok: false, message: "Google connection expired. Reconnect Google Calendar." };
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed." };
  }
}

/**
 * Configures iCal/Other delivery preferences (download / email / both).
 */
export async function saveIcsCalendarPrefsAction(
  delivery: IcsDeliveryMode,
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    const parsed = icsDeliverySchema.safeParse(delivery);
    if (!parsed.success) {
      return { ok: false, message: "Invalid delivery preference." };
    }

    await ensureDbReady();
    const db = getDb();
    const now = new Date().toISOString();
    const [existing] = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, user.id))
      .limit(1);

    if (existing) {
      await db
        .update(calendarConnections)
        .set({
          provider: "ics",
          icsDelivery: parsed.data,
          googleRefreshTokenEnc: null,
          googleAccessTokenEnc: null,
          googleTokenExpiresAt: null,
          googleCalendarId: null,
          googleAccountEmail: null,
          status: "active",
          updatedAt: now,
        })
        .where(eq(calendarConnections.id, existing.id));
    } else {
      await db.insert(calendarConnections).values({
        id: randomUUID(),
        userId: user.id,
        provider: "ics",
        icsDelivery: parsed.data,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }

    await logUserActivity(
      user.id,
      "calendar.ics_prefs_saved",
      JSON.stringify({ delivery: parsed.data }),
    );
    revalidatePath("/profile");
    return { ok: true, message: "iCal / Other preferences saved." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed." };
  }
}

/**
 * Removes the user's calendar connection (stops future sync).
 */
export async function disconnectCalendarAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    await ensureDbReady();
    const db = getDb();
    await db.delete(calendarConnections).where(eq(calendarConnections.userId, user.id));
    await logUserActivity(user.id, "calendar.disconnected", "{}");
    revalidatePath("/profile");
    return { ok: true, message: "Calendar integration disconnected." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed." };
  }
}

/**
 * Lists undelivered pending ICS downloads for the current user.
 */
export async function listPendingIcsDownloadsAction(): Promise<PendingIcsView[]> {
  try {
    const user = await requireUser();
    await ensureDbReady();
    const db = getDb();
    return await db
      .select({
        id: calendarIcsPending.id,
        proposalId: calendarIcsPending.proposalId,
        title: calendarIcsPending.title,
        filename: calendarIcsPending.filename,
        method: calendarIcsPending.method,
        createdAt: calendarIcsPending.createdAt,
      })
      .from(calendarIcsPending)
      .where(
        and(
          eq(calendarIcsPending.userId, user.id),
          isNull(calendarIcsPending.dismissedAt),
          isNull(calendarIcsPending.downloadedAt),
        ),
      )
      .orderBy(desc(calendarIcsPending.createdAt))
      .limit(20);
  } catch {
    return [];
  }
}

/**
 * Marks a pending ICS row dismissed (user skipped download).
 */
export async function dismissPendingIcsAction(
  pendingId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    await ensureDbReady();
    const db = getDb();
    const now = new Date().toISOString();
    await db
      .update(calendarIcsPending)
      .set({ dismissedAt: now, updatedAt: now })
      .where(and(eq(calendarIcsPending.id, pendingId), eq(calendarIcsPending.userId, user.id)));
    revalidatePath("/profile");
    return { ok: true, message: "Dismissed." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed." };
  }
}
