/**
 * Access control for feed-attached image blobs (PC-282).
 * Any signed-in member may view network chat images; proposal-comment images
 * require proposal visibility; staging uploads are author-only.
 */

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  feedImageUploads,
  networkChatCommentImages,
  networkChatComments,
  networkChatMessageImages,
  networkChatMessages,
  proposalCommentImages,
  proposalComments,
  proposals,
  proposalInvitees,
} from "@/lib/db/schema";
import { getAdminCanSeeUninvolved, viewerCanSeeProposalWithSleepingGate } from "@/lib/proposals/access";
import type { UserRole } from "@/types/user";

/**
 * True when the session may download the stored feed image id.
 */
export async function canViewerAccessFeedImage(
  viewerId: string,
  viewerRole: UserRole,
  imageId: string,
): Promise<boolean> {
  const db = getDb();

  const [messageHit] = await db
    .select({ messageId: networkChatMessageImages.messageId })
    .from(networkChatMessageImages)
    .innerJoin(
      networkChatMessages,
      eq(networkChatMessages.id, networkChatMessageImages.messageId),
    )
    .where(
      and(eq(networkChatMessageImages.imageId, imageId), isNull(networkChatMessages.deletedAt)),
    )
    .limit(1);
  if (messageHit) return true;

  const [commentHit] = await db
    .select({ commentId: networkChatCommentImages.commentId })
    .from(networkChatCommentImages)
    .innerJoin(
      networkChatComments,
      eq(networkChatComments.id, networkChatCommentImages.commentId),
    )
    .innerJoin(
      networkChatMessages,
      eq(networkChatMessages.id, networkChatComments.messageId),
    )
    .where(
      and(
        eq(networkChatCommentImages.imageId, imageId),
        isNull(networkChatComments.deletedAt),
        isNull(networkChatMessages.deletedAt),
      ),
    )
    .limit(1);
  if (commentHit) return true;

  const [proposalCommentHit] = await db
    .select({
      proposalId: proposalComments.proposalId,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
    })
    .from(proposalCommentImages)
    .innerJoin(proposalComments, eq(proposalComments.id, proposalCommentImages.commentId))
    .innerJoin(proposals, eq(proposals.id, proposalComments.proposalId))
    .where(and(eq(proposalCommentImages.imageId, imageId), isNull(proposalComments.deletedAt)))
    .limit(1);

  if (proposalCommentHit) {
    const invitees = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(eq(proposalInvitees.proposalId, proposalCommentHit.proposalId));
    const adminCanSeeUninvolved = await getAdminCanSeeUninvolved(db);
    return viewerCanSeeProposalWithSleepingGate(
      viewerId,
      viewerRole === "admin",
      proposalCommentHit.proposerId,
      invitees.map((i) => i.userId),
      {
        proposalType: proposalCommentHit.proposalType,
        state: proposalCommentHit.state,
        adminCanSeeUninvolved,
      },
    );
  }

  const [staging] = await db
    .select({ userId: feedImageUploads.userId })
    .from(feedImageUploads)
    .where(eq(feedImageUploads.imageId, imageId))
    .limit(1);
  if (staging) {
    return staging.userId === viewerId || viewerRole === "admin";
  }

  return false;
}
