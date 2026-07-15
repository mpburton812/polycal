"use server";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
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
  polyGroup,
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
  FEED_MILESTONE_ACTIONS,
  type FeedComment,
  type FeedItem,
  type FeedMilestone,
  type NetworkChatMessage,
} from "@/lib/feed/types";
import { notifyUser } from "@/lib/notifications";
import {
  applyProposalMask,
  getPrivacyAdminFlags,
  getSleepingNetworkVisibility,
  shouldMaskProposalContent,
  viewerCanSeeAuditLog,
  viewerCanSeeProposalWithSleepingGate,
} from "@/lib/proposals/access";
import { formatProposalLogLine } from "@/lib/proposals/state-log-format";
import { canCommentOnProposal } from "@/lib/schedule/slice-auth";
import { readFeedImageUploads } from "@/lib/feed/images";
import type { AuditLogVisibility } from "@/types/poly-group";

const listFeedSchema = z.object({
  cursor: z.string().optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
});

const chatPostSchema = z.object({
  body: z.string().trim().max(2000).optional().default(""),
  imageIds: z.array(z.string().min(1)).max(MAX_FEED_IMAGES).optional().default([]),
});

const chatCommentSchema = z.object({
  messageId: z.string().min(1),
  body: z.string().trim().max(2000).optional().default(""),
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
 * Unified chronological feed: milestones + chat (PC-232).
 */
export async function listFeedItemsAction(
  input: z.infer<typeof listFeedSchema> = {},
): Promise<{ ok: boolean; message: string; items?: FeedItem[]; nextCursor?: string | null }> {
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
    const milestones = await loadMilestoneBatch(db, viewerId, isAdmin, limit * 4, cursor);
    const chatMessages = await loadChatBatch(db, viewerId, isAdmin, limit * 4, cursor);

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

    return { ok: true, message: "OK", items, nextCursor };
  });
}

async function loadMilestoneBatch(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  viewerId: string,
  isAdmin: boolean,
  fetchSize: number,
  cursor: { createdAt: string; kind: string; id: string } | null,
): Promise<FeedItem[]> {
  {
    const privacyFlags = await getPrivacyAdminFlags(db);
    const sleepingNetworkVisibility = await getSleepingNetworkVisibility(db);
    const [group] = await db
      .select({ auditLogVisibility: polyGroup.auditLogVisibility })
      .from(polyGroup)
      .where(eq(polyGroup.id, 1))
      .limit(1);
    const auditVisibility = (group?.auditLogVisibility ?? "admin_only") as AuditLogVisibility;

    const conditions = [inArray(proposalStateLog.action, [...FEED_MILESTONE_ACTIONS])];
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
        eventPrivacy: proposals.eventPrivacy,
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
      if (
        !viewerCanSeeProposalWithSleepingGate(viewerId, isAdmin, row.proposerId, inviteeUserIds, {
          proposalType: row.proposalType,
          sleepingNetworkVisibility,
          state: row.state,
          eventPrivacy: row.eventPrivacy,
        })
      ) {
        continue;
      }

      const isProposer = row.proposerId === viewerId;
      const isInvitee = inviteeUserIds.includes(viewerId);
      if (!viewerCanSeeAuditLog(auditVisibility, isAdmin, isProposer, isInvitee)) continue;

      const masked = shouldMaskProposalContent(
        viewerId,
        isAdmin,
        row.proposerId,
        inviteeUserIds,
        row.eventPrivacy,
        privacyFlags.adminCanSeePrivate,
        privacyFlags.adminCanSeeSuperPrivate,
        row.state,
      );

      const display = applyProposalMask(
        {
          title: row.title,
          description: row.description,
          locationName: null,
          scheduledStartAt: row.scheduledStartAt,
          scheduledEndAt: row.scheduledEndAt,
        },
        masked,
      );

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
        canComment: canCommentOnProposal({
          viewerId,
          isAdmin,
          proposerId: row.proposerId,
          inviteeUserIds,
          eventPrivacy: row.eventPrivacy,
          state: row.state,
          isContentMasked: masked,
        }),
        comments: [],
      });
    }

    const commentProposalIds = milestones.filter((m) => !m.masked).map((m) => m.proposalId);
    if (commentProposalIds.length > 0) {
      const commentRows = await db
        .select({
          id: proposalComments.id,
          proposalId: proposalComments.proposalId,
          authorId: proposalComments.authorId,
          body: proposalComments.body,
          createdAt: proposalComments.createdAt,
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
      const commentsByProposal = new Map<string, FeedComment[]>();

      for (const comment of commentRows) {
        const proposerId = proposerByProposal.get(comment.proposalId) ?? "";
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
        authorName: users.displayName,
      })
      .from(networkChatMessages)
      .innerJoin(users, eq(networkChatMessages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(networkChatMessages.createdAt))
      .limit(fetchSize);

    const messageIds = rows.map((r) => r.id);
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
    const commentsByMessage = new Map<string, FeedComment[]>();
    const messageAuthorById = new Map(rows.map((r) => [r.id, r.authorId]));

    for (const comment of commentRows) {
      const messageAuthorId = messageAuthorById.get(comment.messageId) ?? "";
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
      });
      commentsByMessage.set(comment.messageId, list);
    }

    const messages: NetworkChatMessage[] = rows.map((row) => ({
      id: row.id,
      authorId: row.authorId,
      authorName: row.authorName,
      body: row.body,
      createdAt: row.createdAt,
      imageIds: imagesByMessage.get(row.id) ?? [],
      canDelete: isAdmin || row.authorId === viewerId,
      comments: commentsByMessage.get(row.id) ?? [],
    }));

    return messages.map((m) => ({ kind: "chat" as const, ...m }));
  }
}

/**
 * Stores a feed image blob for later attach to a message/comment (PC-236).
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

  return withDb(async (db) => {
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
}

async function assertOwnedImageIds(
  db: Parameters<Parameters<typeof withDb>[0]>[0],
  imageIds: string[],
  uploaderId: string,
): Promise<boolean> {
  if (imageIds.length === 0) return true;
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
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
    const owned = await assertOwnedImageIds(db, parsed.data.imageIds, sessionResult.user.id);
    if (!owned) {
      return { ok: false, message: "One or more images are invalid or expired." };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    await db.insert(networkChatMessages).values({
      id,
      authorId: sessionResult.user.id,
      body: parsed.data.body,
      createdAt: now,
      deletedAt: null,
    });

    for (let i = 0; i < parsed.data.imageIds.length; i += 1) {
      await db.insert(networkChatMessageImages).values({
        id: randomUUID(),
        messageId: id,
        imageId: parsed.data.imageIds[i]!,
        sortOrder: i,
      });
    }

    const [author] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, sessionResult.user.id))
      .limit(1);

    revalidatePath("/feed");
    return {
      ok: true,
      message: "Message sent.",
      item: {
        id,
        authorId: sessionResult.user.id,
        authorName: author?.displayName ?? "Member",
        body: parsed.data.body,
        createdAt: now,
        imageIds: parsed.data.imageIds,
        canDelete: true,
        comments: [],
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
      return { ok: false, message: "One or more images are invalid or expired." };
    }

    const now = new Date().toISOString();
    const commentId = randomUUID();
    await db.insert(networkChatComments).values({
      id: commentId,
      messageId: parsed.data.messageId,
      authorId: sessionResult.user.id,
      body: parsed.data.body,
      createdAt: now,
      deletedAt: null,
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
      },
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

/** @deprecated Use listFeedItemsAction — kept for transitional imports. */
export async function listFeedMilestonesAction(
  input: { cursor?: string | null; limit?: number } = {},
): Promise<{ ok: boolean; message: string; items?: FeedMilestone[]; nextCursor?: string | null }> {
  const result = await listFeedItemsAction(input);
  if (!result.ok) return { ok: false, message: result.message };
  if (!result.items) return { ok: false, message: result.message };
  const milestones = result.items.filter((i) => i.kind === "milestone") as FeedMilestone[];
  return {
    ok: true,
    message: "OK",
    items: milestones,
    nextCursor: result.nextCursor,
  };
}

/** @deprecated Use listFeedItemsAction — kept for transitional imports. */
export async function listNetworkChatMessagesAction(
  input: { limit?: number; before?: string | null } = {},
): Promise<{ ok: boolean; message: string; items?: NetworkChatMessage[] }> {
  const result = await listFeedItemsAction({ limit: input.limit ?? 50, cursor: input.before });
  if (!result.ok) return { ok: false, message: result.message };
  if (!result.items) return { ok: false, message: result.message };
  const chat = result.items.filter((i) => i.kind === "chat") as NetworkChatMessage[];
  return { ok: true, message: "OK", items: chat };
}
