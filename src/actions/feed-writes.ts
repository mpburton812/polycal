"use server";

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

import { loadLikeSummaries } from "./feed-shared";

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
      await db.insert(storedImages).values(
        await storedImageInsert({
          id: imageId,
          mimeType: file.type,
          bytes: buffer,
          createdAt: now,
        }),
      );
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
