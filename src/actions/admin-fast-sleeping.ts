"use server";

import { asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  adminCheckProposalConflictsAction,
  adminForceResolveProposalAction,
  type ProposalConflictWarning,
} from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { requireAdminAccess, withDb } from "@/lib/actions/context";
import { logUserActivity } from "@/lib/audit";
import {
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  users,
} from "@/lib/db/schema";
import {
  buildBatchEntriesFromRows,
  adminFastSleepingPlanSchema,
  type AdminFastSleepingPlanInput,
} from "@/lib/proposals/fast-sleeping-plan";
import {
  createBatchSleepingDraft,
  getAcceptedSleepingPartnerIds,
  validateBatchSleepingEntries,
} from "@/lib/proposals/fast-sleeping-core";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { getDb } from "@/lib/db/client";

export interface AdminFastSleepingPlanResult {
  ok: boolean;
  message: string;
  warnings?: ProposalConflictWarning[];
  proposalId?: string;
}

async function deleteDraftProposal(
  db: ReturnType<typeof getDb>,
  proposalId: string,
): Promise<void> {
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));
  await db.delete(proposalInvitees).where(eq(proposalInvitees.proposalId, proposalId));
  await db.delete(proposalComments).where(eq(proposalComments.proposalId, proposalId));
  await db.delete(proposalStateLog).where(eq(proposalStateLog.proposalId, proposalId));
  await db.delete(proposals).where(eq(proposals.id, proposalId));
}

/**
 * Lists accepted sleeping partners for a target user (admin-only, PC-117).
 */
export async function listSleepingPartnersForUserAction(
  targetUserId: string,
): Promise<PersonSummary[]> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) return [];

  return withDb(async (db) => {
    const partnerIds = [...(await getAcceptedSleepingPartnerIds(db, targetUserId))];
    if (partnerIds.length === 0) return [];

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
        avatarKey: users.avatarKey,
        profileBio: users.profileBio,
      })
      .from(users)
      .where(inArray(users.id, partnerIds))
      .orderBy(asc(users.displayName));

    return rows.map((row) => ({
      ...row,
      avatarKey: row.avatarKey ?? null,
      profileBio: row.profileBio ?? null,
    }));
  });
}

/**
 * Admin fast-add: creates one resolved batch sleeping proposal for a target user (PC-115).
 * Uses shared createBatchSleepingDraft core; force-resolves after conflict warn+confirm.
 */
export async function adminFastAddSleepingPlanAction(
  input: AdminFastSleepingPlanInput,
): Promise<AdminFastSleepingPlanResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  const parsed = adminFastSleepingPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { targetUserId, rows, confirm } = parsed.data;
  const batchEntries = buildBatchEntriesFromRows(rows);

  if (batchEntries.length === 0) {
    return { ok: false, message: "Configure at least one night before submitting." };
  }

  return withDb(async (db) => {
    const [targetUser] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser || targetUser.status === "deleted") {
      return { ok: false, message: "Target user not found." };
    }
    if (targetUser.role === "passive") {
      return { ok: false, message: "Cannot fast-add sleeping plans for proxy users." };
    }

    const validation = await validateBatchSleepingEntries(db, {
      subjectUserId: targetUserId,
      subjectRole: targetUser.role,
      entries: batchEntries,
      locationPolicy: "exists",
    });
    if (!validation.ok) {
      return { ok: false, message: validation.error };
    }

    const { proposalId } = await createBatchSleepingDraft(db, {
      proposerId: targetUserId,
      proposerName: targetUser.displayName,
      actorUserId: adminResult.user.id,
      entries: batchEntries,
      titleState: "resolved",
    });

    if (!confirm) {
      const conflictCheck = await adminCheckProposalConflictsAction(proposalId);
      if (!conflictCheck.ok) {
        await deleteDraftProposal(db, proposalId);
        return { ok: false, message: conflictCheck.message };
      }
      if (conflictCheck.warnings.length > 0) {
        await deleteDraftProposal(db, proposalId);
        return {
          ok: false,
          message: "Schedule conflicts detected. Review warnings and confirm to submit.",
          warnings: conflictCheck.warnings,
        };
      }
    }

    const activityDetails = JSON.stringify({
      targetUserId,
      targetDisplayName: targetUser.displayName,
      nightCount: batchEntries.length,
      proposalId,
    });

    await logProposalTransition(
      db,
      proposalId,
      adminResult.user.id,
      "proposal.admin_fast_add",
      activityDetails,
    );

    const resolveResult = await adminForceResolveProposalAction(proposalId, adminResult.user.id);
    if (!resolveResult.ok) {
      await deleteDraftProposal(db, proposalId);
      return { ok: false, message: resolveResult.message };
    }

    await logUserActivity(adminResult.user.id, "admin.fast_sleeping_plan_add", activityDetails);

    revalidatePath("/admin");
    revalidatePath("/proposals");
    revalidatePath("/schedule");
    revalidatePath("/people-places");

    return {
      ok: true,
      message: `Sleeping plan added for ${targetUser.displayName} (${batchEntries.length} night${batchEntries.length === 1 ? "" : "s"}).`,
      proposalId,
    };
  });
}
