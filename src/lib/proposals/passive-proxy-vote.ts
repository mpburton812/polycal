import { and, eq, inArray } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { proposalInvitees, users } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Returns whether the actor may cast a proxy vote for a passive invitee (PC-246).
 * Admins always can; otherwise only the user who added the invitee.
 */
export async function canProxyVoteForPassiveInvitee(
  db: Db,
  inviteeUserId: string,
  addedByUserId: string | null | undefined,
  actorUserId: string,
  isAdmin: boolean,
): Promise<{ ok: true; displayName: string } | { ok: false; message: string }> {
  const [user] = await db
    .select({ id: users.id, displayName: users.displayName, role: users.role })
    .from(users)
    .where(eq(users.id, inviteeUserId))
    .limit(1);

  if (!user) {
    return { ok: false, message: "Invitee not found." };
  }
  if (user.role !== "passive") {
    return { ok: false, message: "Proxy voting is only available for passive profiles." };
  }
  if (!isAdmin && addedByUserId !== actorUserId) {
    return {
      ok: false,
      message: "Only the person who added this passive profile can vote on their behalf.",
    };
  }
  return { ok: true, displayName: user.displayName };
}

/**
 * Loads role map for invitee user ids (passive vs active).
 */
export async function loadUserRolesById(
  db: Db,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((row) => [row.id, row.role]));
}

/**
 * Returns invitee rows that still need a proxy vote from the given actor (PC-246).
 */
export async function listPassiveInviteesNeedingProxyVote(
  db: Db,
  proposalId: string,
  actorUserId: string,
  isAdmin: boolean,
): Promise<{ userId: string; displayName: string; voteStatus: string }[]> {
  const invitees = await db
    .select({
      userId: proposalInvitees.userId,
      voteStatus: proposalInvitees.voteStatus,
      addedByUserId: proposalInvitees.addedByUserId,
      displayName: users.displayName,
      role: users.role,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id))
    .where(and(eq(proposalInvitees.proposalId, proposalId), eq(users.role, "passive")));

  return invitees
    .filter(
      (row) =>
        row.voteStatus === "not_seen" &&
        (isAdmin || row.addedByUserId === actorUserId),
    )
    .map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      voteStatus: row.voteStatus,
    }));
}
