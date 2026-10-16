"use server";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { storedImageInsert } from "@/lib/blobs/image-bytes";
import { loadChatBatch, loadImageIdsByParent, loadLikeSummaries, loadMilestoneBatch } from "./feed-shared";
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
    .from(networkChatComments)
    .innerJoin(
      networkChatMessages,
      eq(networkChatComments.messageId, networkChatMessages.id),
    )
    .where(eq(networkChatMessages.networkId, networkId));

  const [proposalCommentsAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      maxCreatedAt: sql<string | null>`max(${proposalComments.createdAt})`,
      maxDeletedAt: sql<string | null>`max(${proposalComments.deletedAt})`,
    })
    .from(proposalComments)
    .innerJoin(proposals, eq(proposalComments.proposalId, proposals.id))
    .where(eq(proposals.networkId, networkId));

  const chatIds = db
    .select({ id: networkChatMessages.id })
    .from(networkChatMessages)
    .where(eq(networkChatMessages.networkId, networkId));
  const chatCommentIds = db
    .select({ id: networkChatComments.id })
    .from(networkChatComments)
    .innerJoin(
      networkChatMessages,
      eq(networkChatComments.messageId, networkChatMessages.id),
    )
    .where(eq(networkChatMessages.networkId, networkId));
  const milestoneIds = db
    .select({ id: proposalStateLog.id })
    .from(proposalStateLog)
    .innerJoin(proposals, eq(proposalStateLog.proposalId, proposals.id))
    .where(eq(proposals.networkId, networkId));
  const proposalCommentIds = db
    .select({ id: proposalComments.id })
    .from(proposalComments)
    .innerJoin(proposals, eq(proposalComments.proposalId, proposals.id))
    .where(eq(proposals.networkId, networkId));
  const networkLikeScope = or(
    and(eq(feedLikes.targetType, "chat"), inArray(feedLikes.targetId, chatIds)),
    and(eq(feedLikes.targetType, "chat_comment"), inArray(feedLikes.targetId, chatCommentIds)),
    and(eq(feedLikes.targetType, "milestone"), inArray(feedLikes.targetId, milestoneIds)),
    and(
      eq(feedLikes.targetType, "proposal_comment"),
      inArray(feedLikes.targetId, proposalCommentIds),
    ),
  );

  const [likesAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      maxCreatedAt: sql<string | null>`max(${feedLikes.createdAt})`,
    })
    .from(feedLikes)
    .where(networkLikeScope);

  const [viewerLikesAgg] = await db
    .select({ count: sql<number>`count(*)` })
    .from(feedLikes)
    .where(and(eq(feedLikes.userId, viewerId), networkLikeScope));

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

