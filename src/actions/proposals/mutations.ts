"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { cleanupResidencyProposalLinkage } from "@/actions/residency-proposals";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
} from "@/lib/db/schema";

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

  await cleanupResidencyProposalLinkage(db, proposal, true);

  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));
  await db.delete(proposalInvitees).where(eq(proposalInvitees.proposalId, proposalId));
  await db.delete(proposalComments).where(eq(proposalComments.proposalId, proposalId));
  await db.delete(proposalStateLog).where(eq(proposalStateLog.proposalId, proposalId));
  await db.delete(proposals).where(eq(proposals.id, proposalId));

  await logUserActivity(session.user.id, "proposals.draft_delete", proposalId);
  revalidatePath("/proposals");
  revalidatePath("/people-places");

  return { ok: true, message: "Draft deleted." };
}
