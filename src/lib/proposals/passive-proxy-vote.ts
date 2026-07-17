import { and, eq, inArray } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { proposalInvitees, users } from "@/lib/db/schema";
import { getAcceptedSleepingPartnerIds } from "@/lib/proposals/fast-sleeping-core";

type Db = ReturnType<typeof getDb>;

export type ProxyVoteAuthInput = {
  inviteeUserId: string;
  actorUserId: string;
  isAdmin: boolean;
  proposerId: string;
};

/**
 * Returns whether the actor may cast a proxy vote for a proxy (passive) invitee (PC-246 / PC-255).
 * Admins, the proposal proposer, or an accepted sleeping partner of the proxy profile may vote.
 */
export async function canProxyVoteForPassiveInvitee(
  db: Db,
  input: ProxyVoteAuthInput,
): Promise<{ ok: true; displayName: string } | { ok: false; message: string }> {
  const [user] = await db
    .select({ id: users.id, displayName: users.displayName, role: users.role })
    .from(users)
    .where(eq(users.id, input.inviteeUserId))
    .limit(1);

  if (!user) {
    return { ok: false, message: "Invitee not found." };
  }
  if (user.role !== "passive") {
    return { ok: false, message: "Proxy voting is only available for proxy profiles." };
  }

  if (input.isAdmin || input.actorUserId === input.proposerId) {
    return { ok: true, displayName: user.displayName };
  }

  const partners = await getAcceptedSleepingPartnerIds(db, input.inviteeUserId);
  if (partners.has(input.actorUserId)) {
    return { ok: true, displayName: user.displayName };
  }

  return {
    ok: false,
    message:
      "Only the proposer or a sleeping partner of this proxy profile can vote on their behalf.",
  };
}

/**
 * True when the actor may proxy-vote for this proxy invitee (sync helper for UI flags).
 */
export function actorCanProxyVoteSync(params: {
  isAdmin: boolean;
  actorUserId: string;
  proposerId: string;
  sleepingPartnerIds: ReadonlySet<string> | string[];
}): boolean {
  if (params.isAdmin) return true;
  if (params.actorUserId === params.proposerId) return true;
  const partners =
    params.sleepingPartnerIds instanceof Set
      ? params.sleepingPartnerIds
      : new Set(params.sleepingPartnerIds);
  return partners.has(params.actorUserId);
}

/**
 * Loads role map for invitee user ids.
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
 * Returns invitee rows that still need a proxy vote from the given actor (PC-255).
 */
export async function listPassiveInviteesNeedingProxyVote(
  db: Db,
  proposalId: string,
  actorUserId: string,
  isAdmin: boolean,
  proposerId: string,
): Promise<{ userId: string; displayName: string; voteStatus: string }[]> {
  const invitees = await db
    .select({
      userId: proposalInvitees.userId,
      voteStatus: proposalInvitees.voteStatus,
      displayName: users.displayName,
      role: users.role,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id))
    .where(and(eq(proposalInvitees.proposalId, proposalId), eq(users.role, "passive")));

  const results: { userId: string; displayName: string; voteStatus: string }[] = [];
  for (const row of invitees) {
    if (row.voteStatus !== "not_seen") continue;
    const check = await canProxyVoteForPassiveInvitee(db, {
      inviteeUserId: row.userId,
      actorUserId,
      isAdmin,
      proposerId,
    });
    if (check.ok) {
      results.push({
        userId: row.userId,
        displayName: row.displayName,
        voteStatus: row.voteStatus,
      });
    }
  }
  return results;
}
