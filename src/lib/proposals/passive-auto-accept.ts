import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { proposalInvitees, proposalStateLog, users } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Auto-accepts passive-user invitees and logs state transitions (PC-65).
 * Passive profiles never vote manually — their acceptance is recorded immediately.
 */
export async function applyPassiveInviteeAutoAccept(
  db: Db,
  proposalId: string,
  actorUserId: string,
): Promise<void> {
  const invitees = await db
    .select({
      id: proposalInvitees.id,
      userId: proposalInvitees.userId,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  if (invitees.length === 0) return;

  const userRows = await db
    .select({ id: users.id, displayName: users.displayName, role: users.role })
    .from(users)
    .where(inArray(users.id, invitees.map((row) => row.userId)));

  const userById = new Map(userRows.map((row) => [row.id, row]));
  const now = new Date().toISOString();

  for (const invitee of invitees) {
    const user = userById.get(invitee.userId);
    if (!user || user.role !== "passive") continue;
    if (invitee.voteStatus === "accept") continue;

    await db
      .update(proposalInvitees)
      .set({ voteStatus: "accept", respondedAt: now })
      .where(eq(proposalInvitees.id, invitee.id));

    await db.insert(proposalStateLog).values({
      id: `psl-${randomUUID()}`,
      proposalId,
      actorUserId,
      action: "proposal.passive_auto_accept",
      details: JSON.stringify({
        displayName: user.displayName,
        message: `passive user ${user.displayName} auto-accepts`,
      }),
      createdAt: now,
    });
  }
}

/**
 * Returns whether a sleeping proposal allows attendee management for the viewer (PC-64).
 */
export function canManageSleepingAttendees(isProposer: boolean, isAdmin: boolean): boolean {
  return isProposer || isAdmin;
}
