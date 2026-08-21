"use server";

import { z } from "zod";

import { logUserActivity } from "@/lib/audit";
import { logPlatformEvent } from "@/lib/platform-log";
import { requireSession } from "@/lib/actions/context";
import { LONG_TEXT_MAX, maxCharsMessage } from "@/lib/validation/string-limits";

const supportSchema = z
  .string()
  .trim()
  .min(1, "Message is required.")
  .max(LONG_TEXT_MAX, maxCharsMessage("Support message", LONG_TEXT_MAX));

/**
 * Records a user support note as an emphasized platform log for all operators.
 * Intentionally does not email anyone (PC-464).
 */
export async function submitSupportMessageAction(
  raw: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, message: session.message };

  const parsed = supportSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid message." };
  }

  await logUserActivity(
    session.user.id,
    "support.message",
    parsed.data,
  );
  await logPlatformEvent({
    actorUserId: session.user.id,
    action: "support.message",
    summary: `Support message: ${parsed.data}`,
    severity: "major",
    emphasized: true,
  });

  return { ok: true, message: "Thanks — platform operators will see your message." };
}
