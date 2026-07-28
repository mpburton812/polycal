"use server";

import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withDb } from "@/lib/actions/context";
import { getDb } from "@/lib/db/client";
import {
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  users,
} from "@/lib/db/schema";
import { requireNetworkSession } from "@/lib/networks/context";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { unionFastSleepParticipantIds } from "@/lib/proposals/batch-sleeping";
import {
  getFastSleepDirectPartnerIds,
  getFastSleepReachableUserIds,
  validateFastSleepEntries,
} from "@/lib/proposals/fast-sleep";
import {
  buildBatchEntriesFromRows,
  FAST_SLEEPING_GRID_DAYS,
  fastSleepingRowSchema,
} from "@/lib/proposals/fast-sleeping-plan";
import { createBatchSleepingDraft } from "@/lib/proposals/fast-sleeping-core";
import { getAcceptedSleepingPartnerIds } from "@/lib/proposals/partners";
import { resolveProposal } from "@/lib/proposals/services/resolution";
import { gatherProposalConflictWarnings } from "@/lib/proposals/services/conflicts";
import { formatConflictMessage } from "@/lib/proposals/conflict-message";
import type { ProposalConflictWarning } from "@/actions/proposals";

const createFastSleepSchema = z.object({
  rows: z.array(fastSleepingRowSchema).min(1).max(FAST_SLEEPING_GRID_DAYS),
  confirm: z.boolean().default(false),
  notes: z.string().optional(),
});

export type CreateFastSleepInput = z.infer<typeof createFastSleepSchema>;

export interface CreateFastSleepResult {
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
 * Creates a FastSleep proposal and auto-resolves it (PC-379).
 * One proposal, up to 14 nights, no voting; feed logs proposal.auto_resolved only.
 */
export async function createFastSleepProposalAction(
  input: CreateFastSleepInput,
): Promise<CreateFastSleepResult> {
  const sessionResult = await requireNetworkSession();
  if (!sessionResult.ok) {
    return { ok: false, message: sessionResult.message };
  }

  const parsed = createFastSleepSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const networkId = sessionResult.user.activeNetworkId;
  const settings = await loadNetworkSettings(networkId);
  if (settings && settings.fastSleepEnabled === false) {
    return { ok: false, message: "FastSleep is disabled for this network." };
  }

  const schedulerId = sessionResult.user.id;
  const batchEntries = buildBatchEntriesFromRows(parsed.data.rows, schedulerId).map(
    (entry) => ({
      ...entry,
      subjectUserId: entry.subjectUserId ?? schedulerId,
    }),
  );

  if (batchEntries.length === 0) {
    return { ok: false, message: "Configure at least one night before submitting." };
  }

  return withDb(async (db) => {
    const [scheduler] = await db
      .select({ displayName: users.displayName, role: users.role })
      .from(users)
      .where(eq(users.id, schedulerId))
      .limit(1);
    if (!scheduler) {
      return { ok: false, message: "User not found." };
    }

    const validation = await validateFastSleepEntries(db, {
      schedulerId,
      schedulerRole: scheduler.role,
      entries: batchEntries,
      locationPolicy: "network",
      networkId,
    });
    if (!validation.ok) {
      return { ok: false, message: validation.error };
    }

    const { proposalId } = await createBatchSleepingDraft(db, {
      proposerId: schedulerId,
      proposerName: scheduler.displayName,
      actorUserId: schedulerId,
      entries: batchEntries,
      titleState: "resolved",
      notes: parsed.data.notes ?? null,
      networkId,
      proposalType: "fast_sleep",
    });

    const participantIds = unionFastSleepParticipantIds(schedulerId, batchEntries).filter(
      (id) => id !== schedulerId,
    );
    const now = new Date().toISOString();
    await db.delete(proposalInvitees).where(eq(proposalInvitees.proposalId, proposalId));
    for (const userId of participantIds) {
      await db.insert(proposalInvitees).values({
        id: `pi-${randomUUID()}`,
        proposalId,
        userId,
        role: "optional",
        voteStatus: "accept",
        createdAt: now,
      });
    }

    const [draft] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .limit(1);
    if (!draft) {
      return { ok: false, message: "FastSleep draft was not found after create." };
    }

    if (!parsed.data.confirm) {
      const warnings = await gatherProposalConflictWarnings(db, draft, proposalId);
      if (warnings.length > 0) {
        await deleteDraftProposal(db, proposalId);
        return {
          ok: false,
          message: formatConflictMessage(warnings),
          warnings,
        };
      }
    }

    await resolveProposal(db, draft, schedulerId, {
      awaitCalendarSync: true,
      stateLogAction: "proposal.auto_resolved",
    });

    revalidatePath("/proposals");
    revalidatePath("/schedule");
    revalidatePath("/feed");
    revalidatePath("/people-places");

    return {
      ok: true,
      message: `FastSleep confirmed (${batchEntries.length} night${batchEntries.length === 1 ? "" : "s"}).`,
      proposalId,
    };
  });
}

/**
 * Lists whether FastSleep is enabled for the active network (UI gate).
 */
export async function getFastSleepEnabledAction(): Promise<boolean> {
  const sessionResult = await requireNetworkSession();
  if (!sessionResult.ok) return false;
  const settings = await loadNetworkSettings(sessionResult.user.activeNetworkId);
  return settings?.fastSleepEnabled !== false;
}

export interface FastSleepGraphPerson {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  avatarKey: string | null;
  profileBio: string | null;
}

/**
 * Reachable subjects and per-subject partners for the FastSleep grid (PC-379).
 */
export async function listFastSleepGraphAction(): Promise<{
  ok: boolean;
  message?: string;
  schedulerId: string;
  reachable: FastSleepGraphPerson[];
  directPartnerIds: string[];
  partnersByUserId: Record<string, FastSleepGraphPerson[]>;
}> {
  const sessionResult = await requireNetworkSession();
  if (!sessionResult.ok) {
    return {
      ok: false,
      message: sessionResult.message,
      schedulerId: "",
      reachable: [],
      directPartnerIds: [],
      partnersByUserId: {},
    };
  }

  return withDb(async (db) => {
    const schedulerId = sessionResult.user.id;
    const networkId = sessionResult.user.activeNetworkId;

    const reachableIds = [
      ...(await getFastSleepReachableUserIds(db, schedulerId, networkId)),
    ];
    const directPartnerIds = [
      ...(await getFastSleepDirectPartnerIds(db, schedulerId, networkId)),
    ];

    const peopleRows =
      reachableIds.length === 0
        ? []
        : await db
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
            .where(inArray(users.id, reachableIds))
            .orderBy(asc(users.displayName));

    const toPerson = (row: (typeof peopleRows)[number]): FastSleepGraphPerson => ({
      ...row,
      avatarKey: row.avatarKey ?? null,
      profileBio: row.profileBio ?? null,
    });

    const reachable = peopleRows.map(toPerson);
    const byId = new Map(reachable.map((person) => [person.id, person]));
    const partnersByUserId: Record<string, FastSleepGraphPerson[]> = {};

    for (const subjectId of reachableIds) {
      const partnerIds = [...(await getAcceptedSleepingPartnerIds(db, subjectId, networkId))];
      const known = partnerIds
        .map((id) => byId.get(id))
        .filter((person): person is FastSleepGraphPerson => Boolean(person));
      const missing = partnerIds.filter((id) => !byId.has(id));
      let extras: FastSleepGraphPerson[] = [];
      if (missing.length > 0) {
        const extraRows = await db
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
          .where(inArray(users.id, missing));
        extras = extraRows.map(toPerson);
      }
      partnersByUserId[subjectId] = [...known, ...extras].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      );
    }

    return {
      ok: true,
      schedulerId,
      reachable,
      directPartnerIds,
      partnersByUserId,
    };
  });
}
