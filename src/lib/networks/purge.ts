import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, getSqlClient } from "@/lib/db/client";
import {
  locationResidents,
  locations,
  motdAcknowledgments,
  motdMessages,
  networkChatCommentImages,
  networkChatComments,
  networkChatMessageImages,
  networkChatMessages,
  networkMembers,
  networkSetupTokens,
  networks,
  proposalCommentImages,
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  sleepingPartnerships,
  userActivityLog,
  users,
} from "@/lib/db/schema";
import { logPlatformEvent } from "@/lib/platform-log";

/**
 * Hard-wipes one network's scoped rows. Keeps users and platform_system_log.
 * Members whose only remaining tenant was this network are logged out via
 * sessionVersion bump (PC-462).
 */
export async function purgeNetwork(networkId: string): Promise<{
  ok: boolean;
  networkName: string | null;
}> {
  const db = getDb();
  const sqlClient = getSqlClient();
  const [network] = await db
    .select({ id: networks.id, name: networks.name })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1);
  if (!network) {
    return { ok: false, networkName: null };
  }

  const memberRows = await db
    .select({
      userId: networkMembers.userId,
      role: networkMembers.role,
    })
    .from(networkMembers)
    .where(
      and(eq(networkMembers.networkId, networkId), eq(networkMembers.status, "active")),
    );

  const proposalIds = (
    await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.networkId, networkId))
  ).map((row) => row.id);

  const locationIds = (
    await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.networkId, networkId))
  ).map((row) => row.id);

  const chatIds = (
    await db
      .select({ id: networkChatMessages.id })
      .from(networkChatMessages)
      .where(eq(networkChatMessages.networkId, networkId))
  ).map((row) => row.id);

  const motdIds = (
    await db
      .select({ id: motdMessages.id })
      .from(motdMessages)
      .where(eq(motdMessages.networkId, networkId))
  ).map((row) => row.id);

  if (proposalIds.length > 0) {
    await sqlClient.execute({
      sql: `DELETE FROM calendar_event_links WHERE proposal_id IN (${proposalIds.map(() => "?").join(",")})`,
      args: proposalIds,
    });
    await sqlClient.execute({
      sql: `DELETE FROM calendar_ics_pending WHERE proposal_id IN (${proposalIds.map(() => "?").join(",")})`,
      args: proposalIds,
    });
    await db.delete(proposalSlotVotes).where(inArray(proposalSlotVotes.proposalId, proposalIds));
    await db.delete(proposalTimeSlots).where(inArray(proposalTimeSlots.proposalId, proposalIds));
    await db.delete(proposalInvitees).where(inArray(proposalInvitees.proposalId, proposalIds));
    const commentIds = (
      await db
        .select({ id: proposalComments.id })
        .from(proposalComments)
        .where(inArray(proposalComments.proposalId, proposalIds))
    ).map((row) => row.id);
    if (commentIds.length > 0) {
      await db
        .delete(proposalCommentImages)
        .where(inArray(proposalCommentImages.commentId, commentIds));
    }
    await db.delete(proposalComments).where(inArray(proposalComments.proposalId, proposalIds));
    await db.delete(proposalStateLog).where(inArray(proposalStateLog.proposalId, proposalIds));
    await sqlClient.execute({
      sql: `DELETE FROM feed_likes WHERE target_id IN (${proposalIds.map(() => "?").join(",")})`,
      args: proposalIds,
    });
  }

  if (chatIds.length > 0) {
    const chatCommentIds = (
      await db
        .select({ id: networkChatComments.id })
        .from(networkChatComments)
        .where(inArray(networkChatComments.messageId, chatIds))
    ).map((row) => row.id);
    if (chatCommentIds.length > 0) {
      await db
        .delete(networkChatCommentImages)
        .where(inArray(networkChatCommentImages.commentId, chatCommentIds));
    }
    await db.delete(networkChatComments).where(inArray(networkChatComments.messageId, chatIds));
    await db
      .delete(networkChatMessageImages)
      .where(inArray(networkChatMessageImages.messageId, chatIds));
    await db.delete(networkChatMessages).where(inArray(networkChatMessages.id, chatIds));
  }

  if (locationIds.length > 0) {
    await db.delete(locationResidents).where(inArray(locationResidents.locationId, locationIds));
  }

  await db.delete(sleepingPartnerships).where(eq(sleepingPartnerships.networkId, networkId));
  await db.delete(locations).where(eq(locations.networkId, networkId));
  await db.delete(proposals).where(eq(proposals.networkId, networkId));

  if (motdIds.length > 0) {
    await db.delete(motdAcknowledgments).where(inArray(motdAcknowledgments.motdId, motdIds));
    await db.delete(motdMessages).where(eq(motdMessages.networkId, networkId));
  }

  await db.delete(userActivityLog).where(eq(userActivityLog.networkId, networkId));
  await db
    .update(networkSetupTokens)
    .set({ createdNetworkId: null })
    .where(eq(networkSetupTokens.createdNetworkId, networkId));
  await db.delete(networkMembers).where(eq(networkMembers.networkId, networkId));
  await db.delete(networks).where(eq(networks.id, networkId));

  const now = new Date().toISOString();
  for (const member of memberRows) {
    const remaining = await db
      .select({ id: networkMembers.id })
      .from(networkMembers)
      .where(
        and(eq(networkMembers.userId, member.userId), eq(networkMembers.status, "active")),
      )
      .limit(1);
    if (remaining.length === 0) {
      await db
        .update(users)
        .set({
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, member.userId));
    }
  }

  await logPlatformEvent({
    networkId,
    networkName: network.name,
    action: "networks.wiped",
    summary: `Network wiped: ${network.name}`,
    severity: "major",
  });

  return { ok: true, networkName: network.name };
}

/**
 * Bumps sessionVersion for every non-sponsor active member so JWTs drop the
 * closing network (PC-462).
 */
export async function bumpNonSponsorSessions(networkId: string): Promise<void> {
  const db = getDb();
  const members = await db
    .select({ userId: networkMembers.userId, role: networkMembers.role })
    .from(networkMembers)
    .where(
      and(eq(networkMembers.networkId, networkId), eq(networkMembers.status, "active")),
    );
  const now = new Date().toISOString();
  const nonSponsors = members.filter((member) => member.role !== "sponsor");
  if (nonSponsors.length === 0) return;
  await db
    .update(users)
    .set({
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: now,
    })
    .where(
      inArray(
        users.id,
        nonSponsors.map((member) => member.userId),
      ),
    );
}
