"use server";

/**
 * Proposal comment server actions (PC-329 core carve): add + soft-delete.
 *
 * Moved verbatim out of `_core.ts` (Epic 4) with no behavior change. The
 * comment-permission gate still reuses {@link getProposalDetailAction}'s
 * `canComment` flag (imported directly rather than duplicated) so visibility
 * rules stay in one place; `_core` never imports this module, keeping the
 * graph acyclic.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { adminAccessFromSessionUser, userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  feedImageUploads,
  proposalCommentImages,
  proposalComments,
  proposalTimeSlots,
  proposals,
} from "@/lib/db/schema";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { resolvePreviewForBody } from "@/lib/feed/link-preview-store";

import { commentSchema } from "./schemas";
import { getProposalDetailAction } from "./_core";

/**
 * Adds a comment on a visible proposal (PC-40).
 */
export async function addProposalCommentAction(
  input: z.infer<typeof commentSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  await ensureDbReady();
  const db = getDb();
  const detail = await getProposalDetailAction(parsed.data.proposalId);
  if (!detail.ok || !detail.detail?.canComment) {
    return { ok: false, message: "You cannot comment on this proposal." };
  }

  if (parsed.data.sliceTag) {
    const { validateSliceTagForProposal } = await import("@/lib/schedule/slice-auth");
    const [row] = await db
      .select({
        id: proposals.id,
        isBatchSleeping: proposals.isBatchSleeping,
        isAllDay: proposals.isAllDay,
        scheduledStartAt: proposals.scheduledStartAt,
        scheduledEndAt: proposals.scheduledEndAt,
      })
      .from(proposals)
      .where(eq(proposals.id, parsed.data.proposalId))
      .limit(1);
    if (!row) {
      return { ok: false, message: "Proposal not found." };
    }
    const slotRows = await db
      .select({
        id: proposalTimeSlots.id,
        startAt: proposalTimeSlots.startAt,
        endAt: proposalTimeSlots.endAt,
        isDetached: proposalTimeSlots.isDetached,
      })
      .from(proposalTimeSlots)
      .where(eq(proposalTimeSlots.proposalId, parsed.data.proposalId));
    const tagCheck = validateSliceTagForProposal(
      row,
      slotRows,
      null,
      null,
      parsed.data.sliceTag,
    );
    if (!tagCheck.ok) {
      return { ok: false, message: tagCheck.message };
    }
  }

  const now = new Date().toISOString();
  const commentId = `pc-${randomUUID()}`;

  const imageIds = parsed.data.imageIds ?? [];
  if (imageIds.length > 0) {
    const rows = await db
      .select({ imageId: feedImageUploads.imageId })
      .from(feedImageUploads)
      .where(
        and(
          inArray(feedImageUploads.imageId, imageIds),
          eq(feedImageUploads.userId, session.user.id),
        ),
      );
    if (rows.length !== imageIds.length) {
      return { ok: false, message: "One or more images are invalid or expired." };
    }
  }

  await db.insert(proposalComments).values({
    id: commentId,
    proposalId: parsed.data.proposalId,
    authorId: session.user.id,
    body: parsed.data.body,
    sliceTag: parsed.data.sliceTag ?? null,
    createdAt: now,
    deletedAt: null,
    linkPreviewId: (await resolvePreviewForBody(db, parsed.data.body)).linkPreviewId,
  });

  for (let i = 0; i < imageIds.length; i += 1) {
    await db.insert(proposalCommentImages).values({
      id: randomUUID(),
      commentId,
      imageId: imageIds[i]!,
      sortOrder: i,
    });
  }

  await logProposalTransition(
    db,
    parsed.data.proposalId,
    session.user.id,
    "proposal.comment_added",
    parsed.data.sliceTag ? JSON.stringify({ sliceTag: parsed.data.sliceTag }) : undefined,
  );
  revalidatePath("/proposals");
  revalidatePath("/feed");

  return { ok: true, message: "Comment added." };
}

/**
 * Soft-deletes a proposal comment (author, proposer, or admin) (PC-235).
 */
export async function deleteProposalCommentAction(
  commentId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const id = z.string().min(1).safeParse(commentId);
  if (!id.success) {
    return { ok: false, message: "Invalid comment." };
  }

  await ensureDbReady();
  const db = getDb();
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));

  const [row] = await db
    .select({
      id: proposalComments.id,
      authorId: proposalComments.authorId,
      proposalId: proposalComments.proposalId,
      deletedAt: proposalComments.deletedAt,
    })
    .from(proposalComments)
    .where(eq(proposalComments.id, id.data))
    .limit(1);

  if (!row || row.deletedAt) {
    return { ok: false, message: "Comment not found." };
  }

  const [proposal] = await db
    .select({ proposerId: proposals.proposerId })
    .from(proposals)
    .where(eq(proposals.id, row.proposalId))
    .limit(1);

  const canDelete =
    isAdmin ||
    row.authorId === session.user.id ||
    proposal?.proposerId === session.user.id;

  if (!canDelete) {
    return { ok: false, message: "Not allowed to delete this comment." };
  }

  await db
    .update(proposalComments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(proposalComments.id, id.data));

  revalidatePath("/proposals");
  revalidatePath("/feed");
  return { ok: true, message: "Comment deleted." };
}
