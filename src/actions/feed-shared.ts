import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { storedImageInsert } from "@/lib/blobs/image-bytes";
import { requireNetworkSession } from "@/lib/networks/context";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { requireSession, withDb } from "@/lib/actions/context";
import { adminAccessFromSessionUser, userHasAdminAccess } from "@/lib/admin-access";
import { isFeedEnabledForNetwork } from "@/lib/feed/feed-enabled";
import {
  networkChatCommentImages,
  networkChatComments,
  networkChatMessageImages,
  networkChatMessages,
  feedImageUploads,
  feedLikes,
  proposalCommentImages,
  proposalComments,
  proposalInvitees,
  proposalStateLog,
  proposals,
  storedImages,
  users,
} from "@/lib/db/schema";
import { MAX_FEED_IMAGES } from "@/lib/feed/images";
import {
  emptyLikeSummary,
  FEED_LIKE_TARGET_TYPES,
  type FeedLikeTargetType,
  type FeedLiker,
} from "@/lib/feed/likes";
import {
  classifyChatInvolvement,
  classifyMilestoneInvolvement,
  involvementAllowed,
  milestoneActionsForPrefs,
  networkChatAllowed,
  proposalCommentsAllowed,
} from "@/lib/feed/prefs-filter";
import {
  type FeedActiveEvent,
  type FeedComment,
  type FeedItem,
  type FeedMilestone,
  type NetworkChatMessage,
} from "@/lib/feed/types";
import { isEventHappeningNow } from "@/lib/feed/active-events";
import {
  loadLinkPreviewsById,
  resolvePreviewForBody,
  ensureLinkPreview,
} from "@/lib/feed/link-preview-store";
import { extractFirstUrl, normalizeLinkUrl } from "@/lib/feed/link-preview";
import { checkRateLimitPersistent } from "@/lib/rate-limit";
import { composeFeedFingerprint } from "@/lib/feed/update-token";
import { isFeedMilestoneVisibleViaAdminOnly } from "@/lib/feed/admin-only-visibility";
import { notifyUser } from "@/lib/notifications";
import {
  viewerCanSeeAuditLog,
  viewerCanSeeFeedMilestoneAudit,
  viewerCanSeeProposalWithSleepingGate,
} from "@/lib/proposals/access";
import { getAcceptedSleepingPartnerIds } from "@/lib/proposals/partners";
import { formatProposalLogLine } from "@/lib/proposals/state-log-format";
import { canCommentOnProposal } from "@/lib/schedule/slice-auth";
import { readFeedImageUploads } from "@/lib/feed/images";
import type { AuditLogVisibility } from "@/types/network-settings";
import {
  DEFAULT_FEED_PREFS,
  detectPresetId,
  parseFeedPrefs,
  type FeedPrefs,
} from "@/types/feed-prefs";
import { LONG_TEXT_MAX, maxCharsMessage } from "@/lib/validation/string-limits";

/**
 * Loads image IDs grouped by parent entity for feed rendering (PC-236).
 */
export async function loadImageIdsByParent(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  table: "message" | "chatComment" | "proposalComment",
  parentIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (parentIds.length === 0) return result;

  if (table === "message") {
    const rows = await db
      .select({
        messageId: networkChatMessageImages.messageId,
        imageId: networkChatMessageImages.imageId,
        sortOrder: networkChatMessageImages.sortOrder,
      })
      .from(networkChatMessageImages)
      .where(inArray(networkChatMessageImages.messageId, parentIds))
      .orderBy(asc(networkChatMessageImages.sortOrder));
    for (const row of rows) {
      const list = result.get(row.messageId) ?? [];
      list.push(row.imageId);
      result.set(row.messageId, list);
    }
    return result;
  }

  if (table === "chatComment") {
    const rows = await db
      .select({
        commentId: networkChatCommentImages.commentId,
        imageId: networkChatCommentImages.imageId,
        sortOrder: networkChatCommentImages.sortOrder,
      })
      .from(networkChatCommentImages)
      .where(inArray(networkChatCommentImages.commentId, parentIds))
      .orderBy(asc(networkChatCommentImages.sortOrder));
    for (const row of rows) {
      const list = result.get(row.commentId) ?? [];
      list.push(row.imageId);
      result.set(row.commentId, list);
    }
    return result;
  }

  const rows = await db
    .select({
      commentId: proposalCommentImages.commentId,
      imageId: proposalCommentImages.imageId,
      sortOrder: proposalCommentImages.sortOrder,
    })
    .from(proposalCommentImages)
    .where(inArray(proposalCommentImages.commentId, parentIds))
    .orderBy(asc(proposalCommentImages.sortOrder));
  for (const row of rows) {
    const list = result.get(row.commentId) ?? [];
    list.push(row.imageId);
    result.set(row.commentId, list);
  }
  return result;
}

/**
 * Batches like counts + likedByMe for a set of target ids of one type (PC-239).
 */
export async function loadLikeSummaries(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  targetType: FeedLikeTargetType,
  targetIds: string[],
  viewerId: string,
): Promise<Map<string, { likeCount: number; likedByMe: boolean }>> {
  const result = new Map<string, { likeCount: number; likedByMe: boolean }>();
  for (const id of targetIds) {
    result.set(id, emptyLikeSummary());
  }
  if (targetIds.length === 0) return result;

  const rows = await db
    .select({
      targetId: feedLikes.targetId,
      userId: feedLikes.userId,
    })
    .from(feedLikes)
    .where(and(eq(feedLikes.targetType, targetType), inArray(feedLikes.targetId, targetIds)));

  for (const row of rows) {
    const current = result.get(row.targetId) ?? emptyLikeSummary();
    current.likeCount += 1;
    if (row.userId === viewerId) current.likedByMe = true;
    result.set(row.targetId, current);
  }
  return result;
}

export async function loadMilestoneBatch(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  viewerId: string,
  isAdmin: boolean,
  fetchSize: number,
  cursor: { createdAt: string; kind: string; id: string } | null,
  prefs: FeedPrefs,
  partnerIds: ReadonlySet<string>,
  networkId: string,
): Promise<FeedItem[]> {
  {
    const settings = await loadNetworkSettings(networkId, db);
    const adminCanSeeUninvolved = settings?.adminCanSeeUninvolved ?? true;
    const auditVisibility = (settings?.auditLogVisibility ?? "admin_only") as AuditLogVisibility;

    const allowedActions = milestoneActionsForPrefs(prefs);
    if (allowedActions.length === 0) {
      return [];
    }

    const conditions = [
      inArray(proposalStateLog.action, allowedActions),
      eq(proposals.networkId, networkId),
      isNull(proposalStateLog.deletedAt),
      // Opt-in Post to Feed (PC-414); legacy rows backfilled ON in migration.
      eq(proposals.postToFeed, true),
    ];
    if (cursor) {
      conditions.push(lt(proposalStateLog.createdAt, cursor.createdAt));
    }

    const rows = await db
      .select({
        id: proposalStateLog.id,
        proposalId: proposalStateLog.proposalId,
        action: proposalStateLog.action,
        details: proposalStateLog.details,
        createdAt: proposalStateLog.createdAt,
        actorName: users.displayName,
        title: proposals.title,
        description: proposals.description,
        proposalType: proposals.proposalType,
        state: proposals.state,
        proposerId: proposals.proposerId,
        scheduledStartAt: proposals.scheduledStartAt,
        scheduledEndAt: proposals.scheduledEndAt,
      })
      .from(proposalStateLog)
      .innerJoin(proposals, eq(proposalStateLog.proposalId, proposals.id))
      .leftJoin(users, eq(proposalStateLog.actorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(proposalStateLog.createdAt))
      .limit(Math.min(120, fetchSize * 3));

    const proposalIds = [...new Set(rows.map((row) => row.proposalId))];
    const inviteeRows =
      proposalIds.length > 0
        ? await db
            .select({
              proposalId: proposalInvitees.proposalId,
              userId: proposalInvitees.userId,
            })
            .from(proposalInvitees)
            .where(inArray(proposalInvitees.proposalId, proposalIds))
        : [];
    const inviteesByProposal = new Map<string, string[]>();
    for (const invitee of inviteeRows) {
      const list = inviteesByProposal.get(invitee.proposalId) ?? [];
      list.push(invitee.userId);
      inviteesByProposal.set(invitee.proposalId, list);
    }

    const seePartnersSleepingArrangements =
      settings?.seePartnersSleepingArrangements ?? false;

    const milestones: FeedMilestone[] = [];
    for (const row of rows) {
      if (milestones.length >= fetchSize) break;
      if (row.state === "draft" || row.state === "archived") continue;

      const inviteeUserIds = inviteesByProposal.get(row.proposalId) ?? [];
      const gateOptions = {
        proposalType: row.proposalType,
        state: row.state,
        adminCanSeeUninvolved,
        seePartnersSleepingArrangements,
        acceptedPartnerIds: partnerIds,
      };
      if (
        !viewerCanSeeProposalWithSleepingGate(viewerId, isAdmin, row.proposerId, inviteeUserIds, gateOptions)
      ) {
        continue;
      }

      const isProposer = row.proposerId === viewerId;
      const isInvitee = inviteeUserIds.includes(viewerId);
      if (
        !viewerCanSeeFeedMilestoneAudit(
          row.action,
          auditVisibility,
          isAdmin,
          isProposer,
          isInvitee,
        )
      ) {
        continue;
      }

      const involvement = classifyMilestoneInvolvement(
        viewerId,
        row.proposerId,
        inviteeUserIds,
        partnerIds,
      );
      if (!involvementAllowed(prefs, involvement)) continue;

      // Admin sees this milestone, but a non-admin in the same seat would not (PC-250).
      const visibleViaAdminOnly = isFeedMilestoneVisibleViaAdminOnly({
        isAdmin,
        nonAdminWouldSeeProposal: viewerCanSeeProposalWithSleepingGate(
          viewerId,
          false,
          row.proposerId,
          inviteeUserIds,
          gateOptions,
        ),
        nonAdminWouldSeeAudit: viewerCanSeeFeedMilestoneAudit(
          row.action,
          auditVisibility,
          false,
          isProposer,
          isInvitee,
        ),
      });

      // Feed never applies schedule sleeping mask (PC-306) — content stays unmasked for visible rows.
      const display = { title: row.title };

      const headline = formatProposalLogLine({
        action: row.action,
        actorName: row.actorName,
        details: row.details,
        createdAt: row.createdAt,
      });

      milestones.push({
        id: row.id,
        proposalId: row.proposalId,
        proposerId: row.proposerId,
        action: row.action,
        headline,
        actorName: row.actorName,
        createdAt: row.createdAt,
        proposalTitle: display.title,
        proposalType: row.proposalType,
        proposalState: row.state,
        masked: false,
        visibleViaAdminOnly,
        canDelete: isAdmin,
        canComment: canCommentOnProposal({
          state: row.state,
          isContentMasked: false,
        }),
        comments: [],
        likeCount: 0,
        likedByMe: false,
      });
    }

    const milestoneLikes = await loadLikeSummaries(
      db,
      "milestone",
      milestones.map((m) => m.id),
      viewerId,
    );
    for (const milestone of milestones) {
      const likes = milestoneLikes.get(milestone.id) ?? emptyLikeSummary();
      milestone.likeCount = likes.likeCount;
      milestone.likedByMe = likes.likedByMe;
    }

    const commentProposalIds = proposalCommentsAllowed(prefs)
      ? milestones.filter((m) => !m.masked).map((m) => m.proposalId)
      : [];
    if (commentProposalIds.length > 0) {
      const commentRows = await db
        .select({
          id: proposalComments.id,
          proposalId: proposalComments.proposalId,
          authorId: proposalComments.authorId,
          body: proposalComments.body,
          createdAt: proposalComments.createdAt,
          linkPreviewId: proposalComments.linkPreviewId,
          authorName: users.displayName,
        })
        .from(proposalComments)
        .innerJoin(users, eq(proposalComments.authorId, users.id))
        .where(
          and(
            inArray(proposalComments.proposalId, commentProposalIds),
            isNull(proposalComments.sliceTag),
            isNull(proposalComments.deletedAt),
          ),
        )
        .orderBy(asc(proposalComments.createdAt));

      const proposerByProposal = new Map(milestones.map((m) => [m.proposalId, m.proposerId]));
      const commentIds = commentRows.map((c) => c.id);
      const imagesByComment = await loadImageIdsByParent(db, "proposalComment", commentIds);
      const commentLikes = await loadLikeSummaries(db, "proposal_comment", commentIds, viewerId);
      const previewById = await loadLinkPreviewsById(
        db,
        commentRows.map((c) => c.linkPreviewId).filter((id): id is string => Boolean(id)),
      );
      const commentsByProposal = new Map<string, FeedComment[]>();

      for (const comment of commentRows) {
        const proposerId = proposerByProposal.get(comment.proposalId) ?? "";
        const likes = commentLikes.get(comment.id) ?? emptyLikeSummary();
        const list = commentsByProposal.get(comment.proposalId) ?? [];
        list.push({
          id: comment.id,
          authorId: comment.authorId,
          authorName: comment.authorName,
          body: comment.body,
          createdAt: comment.createdAt,
          imageIds: imagesByComment.get(comment.id) ?? [],
          canDelete:
            isAdmin ||
            comment.authorId === viewerId ||
            proposerId === viewerId,
          likeCount: likes.likeCount,
          likedByMe: likes.likedByMe,
          linkPreview: comment.linkPreviewId
            ? previewById.get(comment.linkPreviewId) ?? null
            : null,
        });
        commentsByProposal.set(comment.proposalId, list);
      }

      for (const milestone of milestones) {
        milestone.comments = commentsByProposal.get(milestone.proposalId) ?? [];
      }
    }

    return milestones.map((m) => ({ kind: "milestone" as const, ...m }));
  }
}

export async function loadChatBatch(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  viewerId: string,
  isAdmin: boolean,
  fetchSize: number,
  cursor: { createdAt: string; kind: string; id: string } | null,
  prefs: FeedPrefs,
  partnerIds: ReadonlySet<string>,
  networkId: string,
): Promise<FeedItem[]> {
  {
    const conditions = [
      eq(networkChatMessages.networkId, networkId),
      isNull(networkChatMessages.deletedAt),
    ];
    if (cursor) {
      conditions.push(lt(networkChatMessages.createdAt, cursor.createdAt));
    }

    const rows = await db
      .select({
        id: networkChatMessages.id,
        authorId: networkChatMessages.authorId,
        body: networkChatMessages.body,
        createdAt: networkChatMessages.createdAt,
        linkPreviewId: networkChatMessages.linkPreviewId,
        authorName: users.displayName,
      })
      .from(networkChatMessages)
      .innerJoin(users, eq(networkChatMessages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(networkChatMessages.createdAt))
      .limit(Math.min(120, fetchSize * 3));

    const filteredRows = rows
      .filter((row) => {
        const bucket = classifyChatInvolvement(viewerId, row.authorId, partnerIds);
        return involvementAllowed(prefs, bucket);
      })
      .slice(0, fetchSize);

    const messageIds = filteredRows.map((r) => r.id);
    const imagesByMessage = await loadImageIdsByParent(db, "message", messageIds);

    const commentRows =
      messageIds.length > 0
        ? await db
            .select({
              id: networkChatComments.id,
              messageId: networkChatComments.messageId,
              authorId: networkChatComments.authorId,
              body: networkChatComments.body,
              createdAt: networkChatComments.createdAt,
              linkPreviewId: networkChatComments.linkPreviewId,
              authorName: users.displayName,
            })
            .from(networkChatComments)
            .innerJoin(users, eq(networkChatComments.authorId, users.id))
            .where(
              and(
                inArray(networkChatComments.messageId, messageIds),
                isNull(networkChatComments.deletedAt),
              ),
            )
            .orderBy(asc(networkChatComments.createdAt))
        : [];

    const commentIds = commentRows.map((c) => c.id);
    const imagesByComment = await loadImageIdsByParent(db, "chatComment", commentIds);
    const chatLikes = await loadLikeSummaries(db, "chat", messageIds, viewerId);
    const chatCommentLikes = await loadLikeSummaries(db, "chat_comment", commentIds, viewerId);
    const previewById = await loadLinkPreviewsById(db, [
      ...filteredRows.map((r) => r.linkPreviewId).filter((id): id is string => Boolean(id)),
      ...commentRows.map((c) => c.linkPreviewId).filter((id): id is string => Boolean(id)),
    ]);
    const commentsByMessage = new Map<string, FeedComment[]>();
    const messageAuthorById = new Map(filteredRows.map((r) => [r.id, r.authorId]));

    for (const comment of commentRows) {
      const messageAuthorId = messageAuthorById.get(comment.messageId) ?? "";
      const likes = chatCommentLikes.get(comment.id) ?? emptyLikeSummary();
      const list = commentsByMessage.get(comment.messageId) ?? [];
      list.push({
        id: comment.id,
        authorId: comment.authorId,
        authorName: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt,
        imageIds: imagesByComment.get(comment.id) ?? [],
        canDelete:
          isAdmin ||
          comment.authorId === viewerId ||
          messageAuthorId === viewerId,
        likeCount: likes.likeCount,
        likedByMe: likes.likedByMe,
        linkPreview: comment.linkPreviewId
          ? previewById.get(comment.linkPreviewId) ?? null
          : null,
      });
      commentsByMessage.set(comment.messageId, list);
    }

    const messages: NetworkChatMessage[] = filteredRows.map((row) => {
      const likes = chatLikes.get(row.id) ?? emptyLikeSummary();
      return {
        id: row.id,
        authorId: row.authorId,
        authorName: row.authorName,
        body: row.body,
        createdAt: row.createdAt,
        imageIds: imagesByMessage.get(row.id) ?? [],
        canDelete: isAdmin || row.authorId === viewerId,
        comments: commentsByMessage.get(row.id) ?? [],
        likeCount: likes.likeCount,
        likedByMe: likes.likedByMe,
        linkPreview: row.linkPreviewId ? previewById.get(row.linkPreviewId) ?? null : null,
      };
    });

    return messages.map((m) => ({ kind: "chat" as const, ...m }));
  }
}
