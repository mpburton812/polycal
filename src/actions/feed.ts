"use server";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession, withDb } from "@/lib/actions/context";
import { userHasAdminAccess } from "@/lib/admin-access";
import {
  networkChatCommentImages,
  networkChatComments,
  networkChatMessageImages,
  networkChatMessages,
  feedImageUploads,
  feedLikes,
  polyGroup,
  proposalCommentImages,
  proposalComments,
  proposalInvitees,
  proposalStateLog,
  proposals,
  sleepingPartnerships,
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
import { buildFeedUpdateToken } from "@/lib/feed/update-token";
import { isFeedMilestoneVisibleViaAdminOnly } from "@/lib/feed/admin-only-visibility";
import { notifyUser } from "@/lib/notifications";
import {
  getAdminCanSeeUninvolved,
  viewerCanSeeAuditLog,
  viewerCanSeeProposalWithSleepingGate,
} from "@/lib/proposals/access";
import { formatProposalLogLine } from "@/lib/proposals/state-log-format";
import { canCommentOnProposal } from "@/lib/schedule/slice-auth";
import { readFeedImageUploads } from "@/lib/feed/images";
import type { AuditLogVisibility } from "@/types/poly-group";
import {
  DEFAULT_FEED_PREFS,
  detectPresetId,
  parseFeedPrefs,
  type FeedPrefs,
} from "@/types/feed-prefs";
import { LONG_TEXT_MAX, maxCharsMessage } from "@/lib/validation/string-limits";

const listFeedSchema = z.object({
  cursor: z.string().optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
});

const chatPostSchema = z.object({
  body: z
    .string()
    .trim()
    .max(LONG_TEXT_MAX, maxCharsMessage("Message", LONG_TEXT_MAX))
    .optional()
    .default(""),
  imageIds: z.array(z.string().min(1)).max(MAX_FEED_IMAGES).optional().default([]),
});

const chatCommentSchema = z.object({
  messageId: z.string().min(1),
  body: z
    .string()
    .trim()
    .max(LONG_TEXT_MAX, maxCharsMessage("Comment", LONG_TEXT_MAX))
    .optional()
    .default(""),
  imageIds: z.array(z.string().min(1)).max(MAX_FEED_IMAGES).optional().default([]),
});

function parseFeedCursor(cursor: string | null | undefined): {
  createdAt: string;
  kind: string;
  id: string;
} | null {
  if (!cursor) return null;
  const parts = cursor.split("|");
  if (parts.length !== 3) return null;
  return { createdAt: parts[0]!, kind: parts[1]!, id: parts[2]! };
}

function encodeFeedCursor(item: FeedItem): string {
  return `${item.createdAt}|${item.kind}|${item.id}`;
}

function itemBeforeCursor(item: FeedItem, cursor: { createdAt: string; kind: string; id: string }): boolean {
  if (item.createdAt < cursor.createdAt) return true;
  if (item.createdAt > cursor.createdAt) return false;
  if (item.kind !== cursor.kind) return item.kind === "chat";
  return item.id < cursor.id;
}

/**
 * Loads image IDs grouped by parent entity for feed rendering (PC-236).
 */
async function loadImageIdsByParent(
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
async function loadLikeSummaries(
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

/**
 * Loads accepted sleeping-partner user IDs for involvement filtering (PC-266).
 */
async function loadAcceptedPartnerIds(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  viewerId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({
      userLowId: sleepingPartnerships.userLowId,
      userHighId: sleepingPartnerships.userHighId,
    })
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.status, "accepted"),
        or(
          eq(sleepingPartnerships.userLowId, viewerId),
          eq(sleepingPartnerships.userHighId, viewerId),
        ),
      ),
    );
  const partners = new Set<string>();
  for (const row of rows) {
    partners.add(row.userLowId === viewerId ? row.userHighId : row.userLowId);
  }
  return partners;
}

/**
 * Loads resolved events overlapping now for the highlighted first-page stack.
 * The same proposal, audit-log, and involvement gates as Feed milestones are
 * applied so pinning never broadens what the viewer is allowed to see (PC-298).
 */
async function loadActiveEvents(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  viewerId: string,
  isAdmin: boolean,
  prefs: FeedPrefs,
  partnerIds: ReadonlySet<string>,
  now: Date,
): Promise<FeedActiveEvent[]> {
  if (!prefs.content.resolved) return [];

  const nowIso = now.toISOString();
  const rows = await db
    .select({
      proposalId: proposals.id,
      title: proposals.title,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.proposalType, "event"),
        eq(proposals.state, "resolved"),
        lte(proposals.scheduledStartAt, nowIso),
        or(
          gte(proposals.scheduledEndAt, nowIso),
          and(isNull(proposals.scheduledEndAt), gte(proposals.scheduledStartAt, nowIso)),
        ),
      ),
    )
    .orderBy(asc(proposals.scheduledStartAt));

  if (rows.length === 0) return [];

  const inviteeRows = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
    })
    .from(proposalInvitees)
    .where(inArray(proposalInvitees.proposalId, rows.map((row) => row.proposalId)));
  const inviteesByProposal = new Map<string, string[]>();
  for (const invitee of inviteeRows) {
    const list = inviteesByProposal.get(invitee.proposalId) ?? [];
    list.push(invitee.userId);
    inviteesByProposal.set(invitee.proposalId, list);
  }

  const adminCanSeeUninvolved = await getAdminCanSeeUninvolved(db);
  const [group] = await db
    .select({ auditLogVisibility: polyGroup.auditLogVisibility })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  const auditVisibility = (group?.auditLogVisibility ?? "admin_only") as AuditLogVisibility;

  const activeEvents: FeedActiveEvent[] = [];
  for (const row of rows) {
    if (!isEventHappeningNow(row, now) || !row.scheduledStartAt) continue;

    const inviteeUserIds = inviteesByProposal.get(row.proposalId) ?? [];
    if (
      !viewerCanSeeProposalWithSleepingGate(
        viewerId,
        isAdmin,
        row.proposerId,
        inviteeUserIds,
        {
          proposalType: row.proposalType,
          state: row.state,
          adminCanSeeUninvolved,
        },
      )
    ) {
      continue;
    }

    const isProposer = row.proposerId === viewerId;
    const isInvitee = inviteeUserIds.includes(viewerId);
    if (!viewerCanSeeAuditLog(auditVisibility, isAdmin, isProposer, isInvitee)) continue;

    const involvement = classifyMilestoneInvolvement(
      viewerId,
      row.proposerId,
      inviteeUserIds,
      partnerIds,
    );
    if (!involvementAllowed(prefs, involvement)) continue;

    activeEvents.push({
      proposalId: row.proposalId,
      title: row.title,
      scheduledStartAt: row.scheduledStartAt,
      scheduledEndAt: row.scheduledEndAt,
      proposalState: row.state,
    });
  }

  return activeEvents;
}

/**
 * Loads Feed Controls prefs for the signed-in user (PC-265).
 */
export async function getFeedPrefsAction(): Promise<FeedPrefs> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return { ...DEFAULT_FEED_PREFS };

  return withDb(async (db) => {
    const [row] = await db
      .select({ feedPrefsJson: users.feedPrefsJson })
      .from(users)
      .where(eq(users.id, sessionResult.user.id))
      .limit(1);
    return parseFeedPrefs(row?.feedPrefsJson);
  });
}

/**
 * Saves Feed Controls prefs and revalidates the feed (PC-265).
 */
export async function updateFeedPrefsAction(
  prefs: FeedPrefs,
): Promise<{ ok: boolean; message: string; prefs?: FeedPrefs }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const normalized: FeedPrefs = {
    involvement: { ...prefs.involvement },
    content: { ...prefs.content },
    messagesInclude: { ...prefs.messagesInclude },
    presetId: detectPresetId(prefs),
  };

  await withDb(async (db) => {
    await db
      .update(users)
      .set({
        feedPrefsJson: JSON.stringify(normalized),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, sessionResult.user.id));
  });

  revalidatePath("/feed");
  return { ok: true, message: "OK", prefs: normalized };
}

/**
 * Unified chronological feed: milestones + chat (PC-232), filtered by FeedPrefs (PC-266).
 */
export async function listFeedItemsAction(
  input: z.infer<typeof listFeedSchema> = {},
): Promise<{
  ok: boolean;
  message: string;
  items?: FeedItem[];
  activeEvents?: FeedActiveEvent[];
  nextCursor?: string | null;
}> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = listFeedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const limit = parsed.data.limit ?? 20;
  const cursor = parseFeedCursor(parsed.data.cursor ?? null);
  const viewerId = sessionResult.user.id;
  const isAdmin = await userHasAdminAccess(sessionResult.user.role);

  // Single DB handle — parallel withDb on sqlite can stall local e2e (PC-232).
  return withDb(async (db) => {
    const [prefsRow] = await db
      .select({ feedPrefsJson: users.feedPrefsJson })
      .from(users)
      .where(eq(users.id, viewerId))
      .limit(1);
    const prefs = parseFeedPrefs(prefsRow?.feedPrefsJson);
    const partnerIds = await loadAcceptedPartnerIds(db, viewerId);
    const activeEvents =
      parsed.data.cursor == null
        ? await loadActiveEvents(db, viewerId, isAdmin, prefs, partnerIds, new Date())
        : [];

    const milestones = await loadMilestoneBatch(
      db,
      viewerId,
      isAdmin,
      limit * 4,
      cursor,
      prefs,
      partnerIds,
    );
    const chatMessages = networkChatAllowed(prefs)
      ? await loadChatBatch(db, viewerId, isAdmin, limit * 4, cursor, prefs, partnerIds)
      : [];

    let merged: FeedItem[] = [...milestones, ...chatMessages];
    merged.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      if (a.kind !== b.kind) return a.kind === "chat" ? -1 : 1;
      return a.id < b.id ? 1 : -1;
    });

    if (cursor) {
      merged = merged.filter((item) => itemBeforeCursor(item, cursor));
    }

    const items = merged.slice(0, limit);
    const nextCursor =
      merged.length > limit && items.length > 0
        ? encodeFeedCursor(items[items.length - 1]!)
        : null;

    return { ok: true, message: "OK", items, activeEvents, nextCursor };
  });
}

/**
 * Cheap first-page fingerprint so the Feed client can skip full reloads when
 * the head is unchanged (PC-239 silent poll).
 */
export async function getFeedUpdateTokenAction(): Promise<{
  ok: boolean;
  message: string;
  token?: string;
}> {
  const result = await listFeedItemsAction({ cursor: null, limit: 20 });
  if (!result.ok || !result.items) {
    return { ok: false, message: result.message };
  }
  return {
    ok: true,
    message: "OK",
    token: buildFeedUpdateToken(result.items, result.activeEvents ?? []),
  };
}

async function loadMilestoneBatch(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  viewerId: string,
  isAdmin: boolean,
  fetchSize: number,
  cursor: { createdAt: string; kind: string; id: string } | null,
  prefs: FeedPrefs,
  partnerIds: ReadonlySet<string>,
): Promise<FeedItem[]> {
  {
    const adminCanSeeUninvolved = await getAdminCanSeeUninvolved(db);
    const [group] = await db
      .select({ auditLogVisibility: polyGroup.auditLogVisibility })
      .from(polyGroup)
      .where(eq(polyGroup.id, 1))
      .limit(1);
    const auditVisibility = (group?.auditLogVisibility ?? "admin_only") as AuditLogVisibility;

    const allowedActions = milestoneActionsForPrefs(prefs);
    if (allowedActions.length === 0) {
      return [];
    }

    const conditions = [inArray(proposalStateLog.action, allowedActions)];
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

    const milestones: FeedMilestone[] = [];
    for (const row of rows) {
      if (milestones.length >= fetchSize) break;
      if (row.state === "draft" || row.state === "archived") continue;

      const inviteeUserIds = inviteesByProposal.get(row.proposalId) ?? [];
      const gateOptions = {
        proposalType: row.proposalType,
        state: row.state,
        adminCanSeeUninvolved,
      };
      if (
        !viewerCanSeeProposalWithSleepingGate(viewerId, isAdmin, row.proposerId, inviteeUserIds, gateOptions)
      ) {
        continue;
      }

      const isProposer = row.proposerId === viewerId;
      const isInvitee = inviteeUserIds.includes(viewerId);
      if (!viewerCanSeeAuditLog(auditVisibility, isAdmin, isProposer, isInvitee)) continue;

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
        nonAdminWouldSeeAudit: viewerCanSeeAuditLog(
          auditVisibility,
          false,
          isProposer,
          isInvitee,
        ),
      });

      // Privacy-level masking was removed (PC-280) — all proposals are "open".
      const masked = false;
      const display = { title: row.title };

      const headline = formatProposalLogLine({
        action: row.action,
        actorName: row.actorName,
        details: masked ? null : row.details,
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
        masked,
        visibleViaAdminOnly,
        canComment: canCommentOnProposal({
          state: row.state,
          isContentMasked: masked,
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

async function loadChatBatch(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  viewerId: string,
  isAdmin: boolean,
  fetchSize: number,
  cursor: { createdAt: string; kind: string; id: string } | null,
  prefs: FeedPrefs,
  partnerIds: ReadonlySet<string>,
): Promise<FeedItem[]> {
  {
    const conditions = [isNull(networkChatMessages.deletedAt)];
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

/**
 * Stores a feed image blob for later attach to a message/comment (PC-236 / PC-259).
 */
export async function uploadFeedImageAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string; imageId?: string }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const uploads = await readFeedImageUploads(formData);
  if (!uploads.ok) return { ok: false, message: uploads.error };
  if (uploads.files.length !== 1) {
    return { ok: false, message: "Upload one image at a time." };
  }

  const file = uploads.files[0]!;
  const imageId = randomUUID();
  const now = new Date().toISOString();

  try {
    return await withDb(async (db) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      await db.insert(storedImages).values({
        id: imageId,
        mimeType: file.type,
        data: buffer,
        createdAt: now,
      });
      await db.insert(feedImageUploads).values({
        imageId,
        userId: sessionResult.user.id,
        createdAt: now,
      });
      return { ok: true, message: "Image uploaded.", imageId };
    });
  } catch (error) {
    console.error("[feed] uploadFeedImageAction failed", error);
    return {
      ok: false,
      message: "Image upload failed. Try a smaller image or try again.",
    };
  }
}

/** How long an uploaded feed image may sit unused before post (PC-247). */
const FEED_IMAGE_FRESHNESS_MS = 30 * 60 * 1000;

const FEED_IMAGE_INVALID_MESSAGE =
  "One or more images are invalid or expired. Re-attach the images and try again.";

/**
 * Confirms imageIds belong to the uploader and were uploaded within the freshness window.
 * Returns true when ownership + freshness checks pass (PC-236/PC-247).
 */
async function assertOwnedImageIds(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  imageIds: string[],
  uploaderId: string,
): Promise<boolean> {
  if (imageIds.length === 0) return true;
  const cutoff = new Date(Date.now() - FEED_IMAGE_FRESHNESS_MS).toISOString();
  const rows = await db
    .select({ imageId: feedImageUploads.imageId })
    .from(feedImageUploads)
    .where(
      and(
        inArray(feedImageUploads.imageId, imageIds),
        eq(feedImageUploads.userId, uploaderId),
      ),
    );
  if (rows.length !== imageIds.length) return false;
  const dated = await db
    .select({ imageId: feedImageUploads.imageId, createdAt: feedImageUploads.createdAt })
    .from(feedImageUploads)
    .where(inArray(feedImageUploads.imageId, imageIds));
  return dated.every((row) => row.createdAt >= cutoff);
}

/**
 * Posts a network chat message with optional images (PC-228/PC-236).
 */
export async function postNetworkChatMessageAction(
  input: z.infer<typeof chatPostSchema>,
): Promise<{ ok: boolean; message: string; item?: NetworkChatMessage }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = chatPostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid message." };
  }
  if (!parsed.data.body && parsed.data.imageIds.length === 0) {
    return { ok: false, message: "Message cannot be empty." };
  }

  return withDb(async (db) => {
    const owned = await assertOwnedImageIds(db, parsed.data.imageIds ?? [], sessionResult.user.id);
    if (!owned) {
      return { ok: false, message: FEED_IMAGE_INVALID_MESSAGE };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const imageIds = parsed.data.imageIds ?? [];
    const { linkPreviewId, linkPreview } = await resolvePreviewForBody(db, parsed.data.body);
    await db.insert(networkChatMessages).values({
      id,
      authorId: sessionResult.user.id,
      body: parsed.data.body,
      createdAt: now,
      deletedAt: null,
      linkPreviewId,
    });

    for (let i = 0; i < imageIds.length; i += 1) {
      await db.insert(networkChatMessageImages).values({
        id: randomUUID(),
        messageId: id,
        imageId: imageIds[i]!,
        sortOrder: i,
      });
    }

    const [author] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, sessionResult.user.id))
      .limit(1);

    // Skip revalidatePath here — client optimistically prepends the item.
    // revalidatePath + useTransition can leave the action promise unsettled in next
    // dev under Playwright (composer stuck pending). Poll/reload refreshes peers.
    return {
      ok: true,
      message: "Message sent.",
      item: {
        id,
        authorId: sessionResult.user.id,
        authorName: author?.displayName ?? "Member",
        body: parsed.data.body,
        createdAt: now,
        imageIds,
        canDelete: true,
        comments: [],
        likeCount: 0,
        likedByMe: false,
        linkPreview,
      },
    };
  });
}

/**
 * Posts a comment on a network chat message; notifies message author (PC-234/PC-237).
 */
export async function postNetworkChatCommentAction(
  input: z.infer<typeof chatCommentSchema>,
): Promise<{ ok: boolean; message: string; comment?: FeedComment }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = chatCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }
  if (!parsed.data.body && parsed.data.imageIds.length === 0) {
    return { ok: false, message: "Comment cannot be empty." };
  }

  return withDb(async (db) => {
    const [message] = await db
      .select({
        id: networkChatMessages.id,
        authorId: networkChatMessages.authorId,
        deletedAt: networkChatMessages.deletedAt,
      })
      .from(networkChatMessages)
      .where(eq(networkChatMessages.id, parsed.data.messageId))
      .limit(1);

    if (!message || message.deletedAt) {
      return { ok: false, message: "Message not found." };
    }

    const owned = await assertOwnedImageIds(db, parsed.data.imageIds, sessionResult.user.id);
    if (!owned) {
      return { ok: false, message: FEED_IMAGE_INVALID_MESSAGE };
    }

    const now = new Date().toISOString();
    const commentId = randomUUID();
    const { linkPreviewId, linkPreview } = await resolvePreviewForBody(db, parsed.data.body);
    await db.insert(networkChatComments).values({
      id: commentId,
      messageId: parsed.data.messageId,
      authorId: sessionResult.user.id,
      body: parsed.data.body,
      createdAt: now,
      deletedAt: null,
      linkPreviewId,
    });

    for (let i = 0; i < parsed.data.imageIds.length; i += 1) {
      await db.insert(networkChatCommentImages).values({
        id: randomUUID(),
        commentId,
        imageId: parsed.data.imageIds[i]!,
        sortOrder: i,
      });
    }

    const [author] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, sessionResult.user.id))
      .limit(1);

    if (message.authorId !== sessionResult.user.id) {
      const authorName = author?.displayName ?? "Someone";
      const preview = parsed.data.body.trim() || "sent an image";
      await notifyUser(message.authorId, "feed_chat_reply", `${authorName} replied: ${preview}`, {
        url: "/feed",
        chatMessageId: parsed.data.messageId,
      });
    }

    revalidatePath("/feed");
    return {
      ok: true,
      message: "Comment posted.",
      comment: {
        id: commentId,
        authorId: sessionResult.user.id,
        authorName: author?.displayName ?? "Member",
        body: parsed.data.body,
        createdAt: now,
        imageIds: parsed.data.imageIds,
        canDelete: true,
        likeCount: 0,
        likedByMe: false,
        linkPreview,
      },
    };
  });
}

/**
 * Debounced composer helper: unfurls a URL for a Facebook-style preview card (PC-279).
 * Rate-limited per user to limit SSRF / egress abuse.
 */
export async function previewFeedLinkAction(
  input: { url: string },
): Promise<{ ok: boolean; message: string; preview?: import("@/lib/feed/types").FeedLinkPreview | null }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = z
    .object({ url: z.string().trim().min(1).max(2048) })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid URL." };
  }

  const normalized = normalizeLinkUrl(parsed.data.url) ?? normalizeLinkUrl(extractFirstUrl(parsed.data.url) ?? "");
  if (!normalized) {
    return { ok: false, message: "URL must be http(s)." };
  }

  if (!(await checkRateLimitPersistent(`feed-link-preview:${sessionResult.user.id}`, 20, 60_000))) {
    return { ok: false, message: "Too many preview requests. Try again shortly." };
  }

  return withDb(async (db) => {
    const preview = await ensureLinkPreview(db, normalized);
    return {
      ok: true,
      message: preview ? "Preview ready." : "No preview available.",
      preview,
    };
  });
}

/**
 * Soft-deletes a network chat message (author or admin) (PC-228).
 */
export async function deleteNetworkChatMessageAction(
  messageId: string,
): Promise<{ ok: boolean; message: string }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const id = z.string().min(1).safeParse(messageId);
  if (!id.success) return { ok: false, message: "Invalid message." };

  const isAdmin = await userHasAdminAccess(sessionResult.user.role);

  return withDb(async (db) => {
    const [row] = await db
      .select({
        id: networkChatMessages.id,
        authorId: networkChatMessages.authorId,
        deletedAt: networkChatMessages.deletedAt,
      })
      .from(networkChatMessages)
      .where(eq(networkChatMessages.id, id.data))
      .limit(1);

    if (!row || row.deletedAt) return { ok: false, message: "Message not found." };
    if (!isAdmin && row.authorId !== sessionResult.user.id) {
      return { ok: false, message: "Not allowed to delete this message." };
    }

    await db
      .update(networkChatMessages)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(networkChatMessages.id, id.data));

    revalidatePath("/feed");
    return { ok: true, message: "Message deleted." };
  });
}

/**
 * Soft-deletes a chat comment (author, message author, or admin) (PC-234).
 */
export async function deleteNetworkChatCommentAction(
  commentId: string,
): Promise<{ ok: boolean; message: string }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const id = z.string().min(1).safeParse(commentId);
  if (!id.success) return { ok: false, message: "Invalid comment." };

  const isAdmin = await userHasAdminAccess(sessionResult.user.role);

  return withDb(async (db) => {
    const [row] = await db
      .select({
        id: networkChatComments.id,
        authorId: networkChatComments.authorId,
        messageId: networkChatComments.messageId,
        deletedAt: networkChatComments.deletedAt,
      })
      .from(networkChatComments)
      .where(eq(networkChatComments.id, id.data))
      .limit(1);

    if (!row || row.deletedAt) return { ok: false, message: "Comment not found." };

    const [message] = await db
      .select({ authorId: networkChatMessages.authorId })
      .from(networkChatMessages)
      .where(eq(networkChatMessages.id, row.messageId))
      .limit(1);

    const canDelete =
      isAdmin ||
      row.authorId === sessionResult.user.id ||
      message?.authorId === sessionResult.user.id;

    if (!canDelete) return { ok: false, message: "Not allowed to delete this comment." };

    await db
      .update(networkChatComments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(networkChatComments.id, id.data));

    revalidatePath("/feed");
    return { ok: true, message: "Comment deleted." };
  });
}

const likeTargetSchema = z.object({
  targetType: z.enum(FEED_LIKE_TARGET_TYPES),
  targetId: z.string().min(1).max(80),
});

/**
 * Verifies the like target still exists (and is not soft-deleted) (PC-239).
 */
async function feedLikeTargetExists(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  targetType: FeedLikeTargetType,
  targetId: string,
): Promise<boolean> {
  if (targetType === "milestone") {
    const [row] = await db
      .select({ id: proposalStateLog.id })
      .from(proposalStateLog)
      .where(eq(proposalStateLog.id, targetId))
      .limit(1);
    return Boolean(row);
  }
  if (targetType === "chat") {
    const [row] = await db
      .select({ id: networkChatMessages.id, deletedAt: networkChatMessages.deletedAt })
      .from(networkChatMessages)
      .where(eq(networkChatMessages.id, targetId))
      .limit(1);
    return Boolean(row && !row.deletedAt);
  }
  if (targetType === "chat_comment") {
    const [row] = await db
      .select({ id: networkChatComments.id, deletedAt: networkChatComments.deletedAt })
      .from(networkChatComments)
      .where(eq(networkChatComments.id, targetId))
      .limit(1);
    return Boolean(row && !row.deletedAt);
  }
  const [row] = await db
    .select({ id: proposalComments.id, deletedAt: proposalComments.deletedAt })
    .from(proposalComments)
    .where(eq(proposalComments.id, targetId))
    .limit(1);
  return Boolean(row && !row.deletedAt);
}

/**
 * Toggles the viewer’s like on a feed target (PC-239).
 */
export async function toggleFeedLikeAction(
  input: z.infer<typeof likeTargetSchema>,
): Promise<{
  ok: boolean;
  message: string;
  likeCount?: number;
  likedByMe?: boolean;
}> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = likeTargetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid like target." };
  }

  return withDb(async (db) => {
    const exists = await feedLikeTargetExists(db, parsed.data.targetType, parsed.data.targetId);
    if (!exists) {
      return { ok: false, message: "Item not found." };
    }

    const [existing] = await db
      .select({ id: feedLikes.id })
      .from(feedLikes)
      .where(
        and(
          eq(feedLikes.targetType, parsed.data.targetType),
          eq(feedLikes.targetId, parsed.data.targetId),
          eq(feedLikes.userId, sessionResult.user.id),
        ),
      )
      .limit(1);

    if (existing) {
      await db.delete(feedLikes).where(eq(feedLikes.id, existing.id));
    } else {
      await db.insert(feedLikes).values({
        id: randomUUID(),
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        userId: sessionResult.user.id,
        createdAt: new Date().toISOString(),
      });
    }

    const summary = await loadLikeSummaries(
      db,
      parsed.data.targetType,
      [parsed.data.targetId],
      sessionResult.user.id,
    );
    const likes = summary.get(parsed.data.targetId) ?? emptyLikeSummary();
    revalidatePath("/feed");
    return {
      ok: true,
      message: likes.likedByMe ? "Liked." : "Like removed.",
      likeCount: likes.likeCount,
      likedByMe: likes.likedByMe,
    };
  });
}

/**
 * Lists people who liked a feed target (PC-239).
 */
export async function listFeedLikersAction(
  input: z.infer<typeof likeTargetSchema>,
): Promise<{ ok: boolean; message: string; likers?: FeedLiker[] }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = likeTargetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid like target." };
  }

  return withDb(async (db) => {
    const rows = await db
      .select({
        userId: feedLikes.userId,
        displayName: users.displayName,
        avatarKey: users.avatarKey,
        likedAt: feedLikes.createdAt,
      })
      .from(feedLikes)
      .innerJoin(users, eq(feedLikes.userId, users.id))
      .where(
        and(
          eq(feedLikes.targetType, parsed.data.targetType),
          eq(feedLikes.targetId, parsed.data.targetId),
        ),
      )
      .orderBy(asc(feedLikes.createdAt));

    return {
      ok: true,
      message: "OK",
      likers: rows.map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        avatarKey: row.avatarKey,
        likedAt: row.likedAt,
      })),
    };
  });
}

