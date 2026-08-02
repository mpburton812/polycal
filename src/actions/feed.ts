"use server";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  networkId: string,
): Promise<Set<string>> {
  return getAcceptedSleepingPartnerIds(db, viewerId, networkId);
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
  networkId: string,
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
        eq(proposals.networkId, networkId),
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

  const settings = await loadNetworkSettings(networkId, db);
  const adminCanSeeUninvolved = settings?.adminCanSeeUninvolved ?? true;
  const auditVisibility = (settings?.auditLogVisibility ?? "admin_only") as AuditLogVisibility;

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
      canComment: canCommentOnProposal({
        state: row.state as "draft" | "proposed" | "resolved" | "archived",
        isContentMasked: false,
      }),
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
  /** Cheap first-page fingerprint so the client can baseline silent polls (PC-336). */
  updateToken?: string;
}> {
  const sessionResult = await requireNetworkSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = listFeedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const limit = parsed.data.limit ?? 20;
  const cursor = parseFeedCursor(parsed.data.cursor ?? null);
  const viewerId = sessionResult.user.id;
  const networkId = sessionResult.user.activeNetworkId;
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(sessionResult.user));

  // Single DB handle — parallel withDb on sqlite can stall local e2e (PC-232).
  return withDb(async (db) => {
    if (!(await isFeedEnabledForNetwork(networkId, db))) {
      return { ok: false, message: "Feed is disabled for this network." };
    }
    const [prefsRow] = await db
      .select({ feedPrefsJson: users.feedPrefsJson })
      .from(users)
      .where(eq(users.id, viewerId))
      .limit(1);
    const prefs = parseFeedPrefs(prefsRow?.feedPrefsJson);
    const partnerIds = await loadAcceptedPartnerIds(db, viewerId, networkId);
    const activeEvents =
      parsed.data.cursor == null
        ? await loadActiveEvents(
            db,
            viewerId,
            isAdmin,
            prefs,
            partnerIds,
            new Date(),
            networkId,
          )
        : [];

    const milestones = await loadMilestoneBatch(
      db,
      viewerId,
      isAdmin,
      limit * 4,
      cursor,
      prefs,
      partnerIds,
      networkId,
    );
    const chatMessages = networkChatAllowed(prefs)
      ? await loadChatBatch(
          db,
          viewerId,
          isAdmin,
          limit * 4,
          cursor,
          prefs,
          partnerIds,
          networkId,
        )
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

    const updateToken = await computeFeedFingerprint(db, viewerId, networkId);

    return { ok: true, message: "OK", items, activeEvents, nextCursor, updateToken };
  });
}

/**
 * Computes the cheap feed fingerprint from COUNT/MAX aggregates and the current
 * active-event set — no hydration of the full feed list (PC-336). Aggregates are
 * global (not visibility-filtered): over-triggering an occasional extra reload is
 * safe, whereas missing a change is not. Filtering here would require the same
 * expensive per-row gates the token is meant to avoid.
 */
async function computeFeedFingerprint(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  viewerId: string,
  networkId: string,
  now: Date = new Date(),
): Promise<string> {
  const [milestones] = await db
    .select({
      count: sql<number>`count(*)`,
      maxCreatedAt: sql<string | null>`max(${proposalStateLog.createdAt})`,
      maxDeletedAt: sql<string | null>`max(${proposalStateLog.deletedAt})`,
    })
    .from(proposalStateLog)
    .innerJoin(proposals, eq(proposalStateLog.proposalId, proposals.id))
    .where(eq(proposals.networkId, networkId));

  const [proposalsAgg] = await db
    .select({ maxUpdatedAt: sql<string | null>`max(${proposals.updatedAt})` })
    .from(proposals)
    .where(eq(proposals.networkId, networkId));

  const [chatMessagesAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      maxCreatedAt: sql<string | null>`max(${networkChatMessages.createdAt})`,
      maxDeletedAt: sql<string | null>`max(${networkChatMessages.deletedAt})`,
    })
    .from(networkChatMessages)
    .where(eq(networkChatMessages.networkId, networkId));

  const [chatCommentsAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      maxCreatedAt: sql<string | null>`max(${networkChatComments.createdAt})`,
      maxDeletedAt: sql<string | null>`max(${networkChatComments.deletedAt})`,
    })
    .from(networkChatComments);

  const [proposalCommentsAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      maxCreatedAt: sql<string | null>`max(${proposalComments.createdAt})`,
      maxDeletedAt: sql<string | null>`max(${proposalComments.deletedAt})`,
    })
    .from(proposalComments);

  const [likesAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      maxCreatedAt: sql<string | null>`max(${feedLikes.createdAt})`,
    })
    .from(feedLikes);

  const [viewerLikesAgg] = await db
    .select({ count: sql<number>`count(*)` })
    .from(feedLikes)
    .where(eq(feedLikes.userId, viewerId));

  const nowIso = now.toISOString();
  const activeEventRows = await db
    .select({
      proposalId: proposals.id,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      proposalState: proposals.state,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.networkId, networkId),
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

  return composeFeedFingerprint({
    milestones: {
      count: Number(milestones?.count ?? 0),
      maxCreatedAt: milestones?.maxCreatedAt ?? null,
      maxDeletedAt: milestones?.maxDeletedAt ?? null,
    },
    proposals: { maxUpdatedAt: proposalsAgg?.maxUpdatedAt ?? null },
    chatMessages: {
      count: Number(chatMessagesAgg?.count ?? 0),
      maxCreatedAt: chatMessagesAgg?.maxCreatedAt ?? null,
      maxDeletedAt: chatMessagesAgg?.maxDeletedAt ?? null,
    },
    chatComments: {
      count: Number(chatCommentsAgg?.count ?? 0),
      maxCreatedAt: chatCommentsAgg?.maxCreatedAt ?? null,
      maxDeletedAt: chatCommentsAgg?.maxDeletedAt ?? null,
    },
    proposalComments: {
      count: Number(proposalCommentsAgg?.count ?? 0),
      maxCreatedAt: proposalCommentsAgg?.maxCreatedAt ?? null,
      maxDeletedAt: proposalCommentsAgg?.maxDeletedAt ?? null,
    },
    likes: {
      count: Number(likesAgg?.count ?? 0),
      maxCreatedAt: likesAgg?.maxCreatedAt ?? null,
      viewerCount: Number(viewerLikesAgg?.count ?? 0),
    },
    activeEvents: activeEventRows,
  });
}

/**
 * Cheap first-page fingerprint so the Feed client can skip full reloads when
 * the head is unchanged (PC-239 silent poll). Uses COUNT/MAX aggregates instead
 * of loading and hydrating the full feed list (PC-336).
 */
export async function getFeedUpdateTokenAction(): Promise<{
  ok: boolean;
  message: string;
  token?: string;
}> {
  const sessionResult = await requireNetworkSession();
  if (!sessionResult.ok) return { ok: false, message: sessionResult.message };

  const networkId = sessionResult.user.activeNetworkId;
  const token = await withDb((db) =>
    computeFeedFingerprint(db, sessionResult.user.id, networkId),
  );
  return { ok: true, message: "OK", token };
}

async function loadMilestoneBatch(
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

async function loadChatBatch(
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

/**
 * Stores a feed image blob for later attach to a message/comment (PC-236 / PC-259).
 */
export async function uploadFeedImageAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string; imageId?: string }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const uploads = await readFeedImageUploads(formData);
  if (!uploads.ok) return { ok: false, message: uploads.message };
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
  const sessionResult = await requireNetworkSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = chatPostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid message." };
  }
  if (!parsed.data.body && parsed.data.imageIds.length === 0) {
    return { ok: false, message: "Message cannot be empty." };
  }

  return withDb(async (db) => {
    if (!(await isFeedEnabledForNetwork(sessionResult.user.activeNetworkId, db))) {
      return { ok: false, message: "Feed is disabled for this network." };
    }
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
      networkId: sessionResult.user.activeNetworkId,
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
  const sessionResult = await requireNetworkSession();
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
        networkId: networkChatMessages.networkId,
        deletedAt: networkChatMessages.deletedAt,
      })
      .from(networkChatMessages)
      .where(eq(networkChatMessages.id, parsed.data.messageId))
      .limit(1);

    if (
      !message ||
      message.deletedAt ||
      message.networkId !== sessionResult.user.activeNetworkId
    ) {
      return { ok: false, message: "Message not found." };
    }

    const owned = await assertOwnedImageIds(
      db,
      parsed.data.imageIds,
      sessionResult.user.id,
    );
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

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(sessionResult.user));

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
 * Soft-deletes a feed milestone (admin only) — hides from feed, keeps audit row (PC-365).
 */
export async function deleteFeedMilestoneAction(
  milestoneId: string,
): Promise<{ ok: boolean; message: string }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  const id = z.string().min(1).safeParse(milestoneId);
  if (!id.success) return { ok: false, message: "Invalid milestone." };

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(sessionResult.user));
  if (!isAdmin) {
    return { ok: false, message: "Not allowed to delete this milestone." };
  }

  return withDb(async (db) => {
    const [row] = await db
      .select({
        id: proposalStateLog.id,
        deletedAt: proposalStateLog.deletedAt,
      })
      .from(proposalStateLog)
      .where(eq(proposalStateLog.id, id.data))
      .limit(1);

    if (!row || row.deletedAt) return { ok: false, message: "Milestone not found." };

    await db
      .update(proposalStateLog)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(proposalStateLog.id, id.data));

    revalidatePath("/feed");
    return { ok: true, message: "Milestone deleted." };
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

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(sessionResult.user));

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
      .select({ id: proposalStateLog.id, deletedAt: proposalStateLog.deletedAt })
      .from(proposalStateLog)
      .where(eq(proposalStateLog.id, targetId))
      .limit(1);
    return Boolean(row && !row.deletedAt);
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
  const sessionResult = await requireNetworkSession();
  if (!sessionResult.ok) return sessionResult;

  const parsed = likeTargetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid like target." };
  }

  return withDb(async (db) => {
    if (!(await isFeedEnabledForNetwork(sessionResult.user.activeNetworkId, db))) {
      return { ok: false, message: "Feed is disabled for this network." };
    }
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

