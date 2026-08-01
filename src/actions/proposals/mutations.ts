"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { cleanupResidencyProposalLinkage } from "@/actions/residency-proposals";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  calendarEventLinks,
  calendarIcsPending,
  locationResidents,
  proposalCommentImages,
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
} from "@/lib/db/schema";
import { dismissAllNotificationsForProposal } from "@/lib/notifications-draft-return";
import { actorNotifyFields, notifyUser } from "@/lib/notifications";

type Db = ReturnType<typeof getDb>;

/**
 * Hard-deletes a proposal and every row that holds an FK to it (PC-295, PC-346).
 * Calendar / residency / recurrence-child FKs must be cleared before the proposal row
 * or SQLite raises SQLITE_CONSTRAINT (seen on production digest deletes).
 */
async function hardDeleteProposalCascade(
  db: Db,
  proposal: typeof proposals.$inferSelect,
): Promise<void> {
  // Best-effort external calendar cancel while the proposal row still exists.
  try {
    const { syncProposalToExternalCalendars } = await import("@/lib/calendar/sync");
    await syncProposalToExternalCalendars(proposal.id, "delete");
  } catch (syncErr) {
    console.error("[hardDelete] calendar sync delete failed", proposal.id, syncErr);
  }
  await db.delete(calendarEventLinks).where(eq(calendarEventLinks.proposalId, proposal.id));
  await db.delete(calendarIcsPending).where(eq(calendarIcsPending.proposalId, proposal.id));

  await cleanupResidencyProposalLinkage(db, proposal, true);
  await db
    .update(locationResidents)
    .set({ proposalId: null, updatedAt: new Date().toISOString() })
    .where(eq(locationResidents.proposalId, proposal.id));

  // Occurrence delete of a recurrence parent must not leave children pointing at it.
  await db
    .update(proposals)
    .set({ parentProposalId: null, updatedAt: new Date().toISOString() })
    .where(eq(proposals.parentProposalId, proposal.id));

  await dismissAllNotificationsForProposal(proposal.id);
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposal.id));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposal.id));
  await db.delete(proposalInvitees).where(eq(proposalInvitees.proposalId, proposal.id));

  const commentIds = (
    await db
      .select({ id: proposalComments.id })
      .from(proposalComments)
      .where(eq(proposalComments.proposalId, proposal.id))
  ).map((r) => r.id);
  if (commentIds.length > 0) {
    await db
      .delete(proposalCommentImages)
      .where(inArray(proposalCommentImages.commentId, commentIds));
  }
  await db.delete(proposalComments).where(eq(proposalComments.proposalId, proposal.id));
  await db.delete(proposalStateLog).where(eq(proposalStateLog.proposalId, proposal.id));
  await db.delete(proposals).where(eq(proposals.id, proposal.id));
}

/**
 * Deletes a draft owned by the signed-in user, or any draft when the actor is an admin (PC-274).
 */
export async function deleteDraftProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  const isAdmin = await userHasAdminAccess(session.user.role);
  const isOwner = proposal?.proposerId === session.user.id;
  if (!proposal || proposal.state !== "draft" || (!isOwner && !isAdmin)) {
    return { ok: false, message: "Draft not found." };
  }

  await hardDeleteProposalCascade(db, proposal);

  await logUserActivity(session.user.id, "proposals.draft_delete", proposalId);
  revalidatePath("/proposals");
  revalidatePath("/people-places");

  return { ok: true, message: "Draft deleted." };
}

/**
 * Admin hard-deletes a proposal in any state (including archived) and notifies participants (PC-295).
 */
export async function adminDeleteProposalAction(
  proposalId: string,
  scope: "occurrence" | "series" = "occurrence",
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const isAdmin = await userHasAdminAccess(session.user.role);
  if (!isAdmin) {
    return { ok: false, message: "Admin access required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal) {
    return { ok: false, message: "Proposal not found." };
  }

  const ids = new Set<string>([proposal.id]);
  if (scope === "series" && (proposal.isRecurrenceParent || proposal.parentProposalId)) {
    const rootId = proposal.isRecurrenceParent ? proposal.id : proposal.parentProposalId!;
    ids.add(rootId);
    const children = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.parentProposalId, rootId));
    for (const child of children) {
      ids.add(child.id);
    }
  }

  const idList = [...ids];
  const rows = await db.select().from(proposals).where(inArray(proposals.id, idList));
  const inviteeRows = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
    })
    .from(proposalInvitees)
    .where(inArray(proposalInvitees.proposalId, idList));

  const recipientIds = new Set<string>();
  for (const row of rows) {
    recipientIds.add(row.proposerId);
  }
  for (const invitee of inviteeRows) {
    recipientIds.add(invitee.userId);
  }

  const primaryTitle = proposal.title;
  const primaryType = proposal.proposalType;
  const deletedCount = rows.length;
  const actor = actorNotifyFields(session.user);

  for (const row of rows) {
    await hardDeleteProposalCascade(db, row);
  }

  const message =
    deletedCount > 1
      ? `${actor.actorDisplayName} deleted "${primaryTitle}" and ${deletedCount - 1} related occurrence(s).`
      : `${actor.actorDisplayName} deleted the proposal "${primaryTitle}".`;

  for (const userId of recipientIds) {
    await notifyUser(userId, "proposal_admin_deleted", message, {
      proposalTitle: primaryTitle,
      proposalType: primaryType,
      url: "/proposals",
      adminDeleted: true,
      scope,
      ...actor,
    });
  }

  await logUserActivity(
    session.user.id,
    "proposals.admin_delete",
    JSON.stringify({ proposalId, scope, deletedCount, title: primaryTitle }),
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  revalidatePath("/people-places");
  revalidatePath("/feed");

  return {
    ok: true,
    message:
      deletedCount > 1
        ? `Deleted ${deletedCount} proposals in the series.`
        : "Proposal deleted.",
  };
}
