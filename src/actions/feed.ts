"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession, withDb } from "@/lib/actions/context";
import { userHasAdminAccess } from "@/lib/admin-access";
import {
  networkChatMessages,
  polyGroup,
  proposalComments,
  proposalInvitees,
  proposalStateLog,
  proposals,
  users,
} from "@/lib/db/schema";
import { FEED_MILESTONE_ACTIONS, type FeedMilestone, type NetworkChatMessage } from "@/lib/feed/types";
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
import type { AuditLogVisibility } from "@/types/poly-group";

const listMilestonesSchema = z.object({
  cursor: z.string().optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
});

const chatBodySchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty.").max(2000),
});

/**
 * Lists network Feed milestones from proposal state log with privacy gates (PC-226).
 */
export async function listFeedMilestonesAction(
  input: z.infer<typeof listMilestonesSchema> = {},
): Promise<{ ok: boolean; message: string; items?: FeedMilestone[]; nextCursor?: string | null }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const parsed = listMilestonesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const limit = parsed.data.limit ?? 20;
  const cursor = parsed.data.cursor ?? null;
  const viewerId = sessionResult.user.id;
  const isAdmin = await userHasAdminAccess(sessionResult.user.role);

  return withDb(async (db) => {
    const privacyFlags = await getPrivacyAdminFlags(db);
    const sleepingNetworkVisibility = await getSleepingNetworkVisibility(db);
    const [group] = await db
      .select({ auditLogVisibility: polyGroup.auditLogVisibility })
      .from(polyGroup)
      .where(eq(polyGroup.id, 1))
      .limit(1);
    const auditVisibility = (group?.auditLogVisibility ??
      "admin_only") as AuditLogVisibility;

    const fetchSize = Math.min(120, limit * 6);
    const conditions = [inArray(proposalStateLog.action, [...FEED_MILESTONE_ACTIONS])];
    if (cursor) {
      conditions.push(lt(proposalStateLog.createdAt, cursor));
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
      .limit(fetchSize);

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

    const items: FeedMilestone[] = [];
    for (const row of rows) {
      if (items.length >= limit) break;
      if (row.state === "draft") continue;

      const inviteeUserIds = inviteesByProposal.get(row.proposalId) ?? [];
      if (
        !viewerCanSeeProposalWithSleepingGate(
          viewerId,
          isAdmin,
          row.proposerId,
          inviteeUserIds,
          {
            proposalType: row.proposalType,
            sleepingNetworkVisibility,
            state: row.state,
            eventPrivacy: row.eventPrivacy,
          },
        )
      ) {
        continue;
      }

      const isProposer = row.proposerId === viewerId;
      const isInvitee = inviteeUserIds.includes(viewerId);
      if (!viewerCanSeeAuditLog(auditVisibility, isAdmin, isProposer, isInvitee)) {
        continue;
      }

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

      const canComment = canCommentOnProposal({
        viewerId,
        isAdmin,
        proposerId: row.proposerId,
        inviteeUserIds,
        eventPrivacy: row.eventPrivacy,
        state: row.state,
        isContentMasked: masked,
      });

      items.push({
        id: row.id,
        proposalId: row.proposalId,
        action: row.action,
        headline,
        actorName: row.actorName,
        createdAt: row.createdAt,
        proposalTitle: display.title,
        proposalType: row.proposalType,
        proposalState: row.state,
        masked,
        canComment,
        recentComments: [],
      });
    }

    const commentProposalIds = items
      .filter((item) => !item.masked)
      .map((item) => item.proposalId);
    if (commentProposalIds.length > 0) {
      const commentRows = await db
        .select({
          id: proposalComments.id,
          proposalId: proposalComments.proposalId,
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
          ),
        )
        .orderBy(desc(proposalComments.createdAt))
        .limit(commentProposalIds.length * 3);

      const commentsByProposal = new Map<string, FeedMilestone["recentComments"]>();
      for (const comment of commentRows) {
        const list = commentsByProposal.get(comment.proposalId) ?? [];
        if (list.length >= 3) continue;
        list.push({
          id: comment.id,
          authorName: comment.authorName,
          body: comment.body,
          createdAt: comment.createdAt,
        });
        commentsByProposal.set(comment.proposalId, list);
      }
      for (const item of items) {
        item.recentComments = (commentsByProposal.get(item.proposalId) ?? []).reverse();
      }
    }

    const nextCursor =
      items.length === limit ? items[items.length - 1]?.createdAt ?? null : null;
    return { ok: true, message: "OK", items, nextCursor };
  });
}

/**
 * Lists recent network chat messages (PC-228).
 */
export async function listNetworkChatMessagesAction(
  input: { limit?: number; before?: string | null } = {},
): Promise<{
  ok: boolean;
  message: string;
  items?: NetworkChatMessage[];
}> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const before = input.before ?? null;
  const viewerId = sessionResult.user.id;
  const isAdmin = await userHasAdminAccess(sessionResult.user.role);

  return withDb(async (db) => {
    const conditions = [isNull(networkChatMessages.deletedAt)];
    if (before) {
      conditions.push(lt(networkChatMessages.createdAt, before));
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
      .limit(limit);

    return {
      ok: true,
      message: "OK",
      items: rows.map((row) => ({
        id: row.id,
        authorId: row.authorId,
        authorName: row.authorName,
        body: row.body,
        createdAt: row.createdAt,
        canDelete: isAdmin || row.authorId === viewerId,
      })),
    };
  });
}

/**
 * Posts a network-wide chat message (PC-228).
 */
export async function postNetworkChatMessageAction(
  input: z.infer<typeof chatBodySchema>,
): Promise<{ ok: boolean; message: string; item?: NetworkChatMessage }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const parsed = chatBodySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid message." };
  }

  return withDb(async (db) => {
    const now = new Date().toISOString();
    const id = randomUUID();
    await db.insert(networkChatMessages).values({
      id,
      authorId: sessionResult.user.id,
      body: parsed.data.body,
      createdAt: now,
      deletedAt: null,
    });

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
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const id = z.string().min(1).safeParse(messageId);
  if (!id.success) {
    return { ok: false, message: "Invalid message." };
  }

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

    if (!row || row.deletedAt) {
      return { ok: false, message: "Message not found." };
    }
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
