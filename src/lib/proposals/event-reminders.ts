import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { proposalInvitees, proposals } from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";

/**
 * Sends pre-event reminder notifications for resolved events with a configured offset (PC-65).
 */
export async function runEventReminders(db: ReturnType<typeof getDb> = getDb()): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();

  const candidates = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      scheduledStartAt: proposals.scheduledStartAt,
      reminderOffsetMinutes: proposals.reminderOffsetMinutes,
      proposerId: proposals.proposerId,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.state, "resolved"),
        eq(proposals.proposalType, "event"),
        isNotNull(proposals.reminderOffsetMinutes),
        isNull(proposals.reminderSentAt),
        isNotNull(proposals.scheduledStartAt),
      ),
    );

  let sent = 0;

  for (const proposal of candidates) {
    const offset = proposal.reminderOffsetMinutes;
    const startAt = proposal.scheduledStartAt;
    if (!offset || !startAt) continue;

    const startMs = new Date(startAt).getTime();
    if (Number.isNaN(startMs)) continue;

    const remindAtMs = startMs - offset * 60_000;
    if (now.getTime() < remindAtMs) continue;
    if (now.getTime() >= startMs) continue;

    const invitees = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(
        and(
          eq(proposalInvitees.proposalId, proposal.id),
          inArray(proposalInvitees.voteStatus, ["accept", "accept_suboptimal"]),
        ),
      );

    const recipientIds = new Set<string>([proposal.proposerId, ...invitees.map((r) => r.userId)]);

    for (const userId of recipientIds) {
      await notifyUser(
        userId,
        "event_reminder",
        `Reminder: "${proposal.title}" starts soon.`,
        {
          proposalId: proposal.id,
          proposalType: "event",
          scheduledStartAt: startAt,
        },
      );
    }

    await db
      .update(proposals)
      .set({ reminderSentAt: nowIso, updatedAt: nowIso })
      .where(and(eq(proposals.id, proposal.id), isNull(proposals.reminderSentAt)));

    sent += 1;
  }

  return sent;
}
