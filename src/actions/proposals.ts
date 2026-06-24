"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locationResidents,
  locations,
  proposalInvitees,
  proposalStateLog,
  proposals,
  users,
  type InviteeRole,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";
import type { UserRole } from "@/types/user";

const inviteeInputSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["required", "optional"]),
});

const draftProposalSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().min(1, "Description is required.").max(2000),
  proposalType: z.enum(["event", "sleeping"]),
  locationId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  intentionalSolo: z.boolean().optional(),
  invitees: z.array(inviteeInputSchema).optional(),
});

export interface ProposalCard {
  id: string;
  title: string;
  description: string | null;
  proposalType: ProposalType;
  state: ProposalState;
  proposerId: string;
  proposerName: string;
  locationName: string | null;
  scheduledStartAt: string | null;
  atRisk: boolean;
  /** True when the viewer must act on a proposed item. */
  needsViewerAction: boolean;
  inviteeCount: number;
}

export interface ProposalBoard {
  draft: ProposalCard[];
  proposed: ProposalCard[];
  resolved: ProposalCard[];
  archived: ProposalCard[];
}

export interface ProposalPlaceOption {
  id: string;
  name: string;
}

/**
 * Appends an immutable state transition entry for proposal audit (PC-40).
 */
async function logProposalTransition(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  actorUserId: string | null,
  action: string,
  details?: string,
): Promise<void> {
  await db.insert(proposalStateLog).values({
    id: `psl-${randomUUID()}`,
    proposalId,
    actorUserId,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}

/** Whether the viewer may see a proposal in a non-draft column. */
function viewerCanSeeProposal(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
): boolean {
  if (isAdmin) return true;
  if (proposerId === viewerId) return true;
  return inviteeUserIds.includes(viewerId);
}

/**
 * Lists Kanban columns scoped to the signed-in user (PC-40).
 */
export async function listProposalBoardAction(): Promise<ProposalBoard> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) {
    return { draft: [], proposed: [], resolved: [], archived: [] };
  }

  const db = getDb();
  const viewerId = session.user.id;
  const isAdmin = await userHasAdminAccess(session.user.role);

  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      description: proposals.description,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      proposerName: users.displayName,
      locationName: locations.name,
      scheduledStartAt: proposals.scheduledStartAt,
      atRisk: proposals.atRisk,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .orderBy(asc(proposals.updatedAt));

  const inviteeRows = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees);

  const inviteesByProposal = new Map<string, typeof inviteeRows>();
  for (const row of inviteeRows) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push(row);
    inviteesByProposal.set(row.proposalId, list);
  }

  const empty: ProposalBoard = { draft: [], proposed: [], resolved: [], archived: [] };

  for (const row of rows) {
    const invitees = inviteesByProposal.get(row.id) ?? [];
    const inviteeUserIds = invitees.map((invitee) => invitee.userId);

    if (row.state === "draft") {
      if (row.proposerId !== viewerId) continue;
    } else if (!viewerCanSeeProposal(viewerId, isAdmin, row.proposerId, inviteeUserIds)) {
      continue;
    }

    const viewerInvitee = invitees.find((invitee) => invitee.userId === viewerId);
    const needsViewerAction =
      row.state === "proposed" &&
      viewerInvitee !== undefined &&
      viewerInvitee.voteStatus === "not_seen";

    const card: ProposalCard = {
      id: row.id,
      title: row.title,
      description: row.description,
      proposalType: row.proposalType,
      state: row.state,
      proposerId: row.proposerId,
      proposerName: row.proposerName,
      locationName: row.locationName ?? null,
      scheduledStartAt: row.scheduledStartAt ?? null,
      atRisk: row.atRisk,
      needsViewerAction,
      inviteeCount: invitees.length,
    };

    const column = row.state as keyof ProposalBoard;
    empty[column].push(card);
  }

  return empty;
}

/**
 * Places the current user may attach to a proposal draft (accepted residency).
 */
export async function listProposalPlaceOptionsAction(): Promise<ProposalPlaceOption[]> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) return [];

  const db = getDb();
  const isAdmin = await userHasAdminAccess(session.user.role);

  if (isAdmin) {
    const all = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .orderBy(asc(locations.name));
    return all;
  }

  const residentRows = await db
    .select({ locationId: locationResidents.locationId })
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.userId, session.user.id),
        eq(locationResidents.status, "accepted"),
      ),
    );

  const locationIds = residentRows.map((row) => row.locationId);
  if (locationIds.length === 0) return [];

  const placeRows = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(inArray(locations.id, locationIds))
    .orderBy(asc(locations.name));

  return placeRows;
}

/**
 * Validates the viewer may use a location on a proposal.
 */
async function assertLocationAllowed(
  db: ReturnType<typeof getDb>,
  userId: string,
  role: string,
  locationId: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!locationId) return { ok: true };

  const [place] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!place) {
    return { ok: false, error: "Selected place was not found." };
  }

  if (await userHasAdminAccess(role as UserRole)) {
    return { ok: true };
  }

  const [resident] = await db
    .select({ id: locationResidents.id })
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, locationId),
        eq(locationResidents.userId, userId),
        eq(locationResidents.status, "accepted"),
      ),
    )
    .limit(1);

  if (!resident) {
    return { ok: false, error: "You can only schedule at places you are associated with." };
  }

  return { ok: true };
}

async function replaceInvitees(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  proposerId: string,
  invitees: { userId: string; role: InviteeRole }[],
): Promise<void> {
  await db.delete(proposalInvitees).where(eq(proposalInvitees.proposalId, proposalId));

  const now = new Date().toISOString();
  const uniqueInvitees = invitees.filter(
    (invitee, index, list) =>
      invitee.userId !== proposerId &&
      list.findIndex((row) => row.userId === invitee.userId) === index,
  );

  for (const invitee of uniqueInvitees) {
    await db.insert(proposalInvitees).values({
      id: `pi-${randomUUID()}`,
      proposalId,
      userId: invitee.userId,
      role: invitee.role,
      voteStatus: "not_seen",
      createdAt: now,
    });
  }
}

/**
 * Creates a new draft proposal for the signed-in user (PC-40).
 */
export async function createDraftProposalAction(
  input: z.infer<typeof draftProposalSchema>,
): Promise<{ ok: boolean; message: string; proposalId?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = draftProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();

  const locationCheck = await assertLocationAllowed(
    db,
    session.user.id,
    session.user.role,
    parsed.data.locationId,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const now = new Date().toISOString();
  const proposalId = `prop-${randomUUID()}`;
  const intentionalSolo = Boolean(parsed.data.intentionalSolo);

  await db.insert(proposals).values({
    id: proposalId,
    title: parsed.data.title,
    description: parsed.data.description,
    proposalType: parsed.data.proposalType,
    state: "draft",
    proposerId: session.user.id,
    locationId: parsed.data.locationId ?? null,
    notes: parsed.data.notes ?? null,
    intentionalSolo,
    createdAt: now,
    updatedAt: now,
  });

  if (parsed.data.invitees?.length) {
    await replaceInvitees(db, proposalId, session.user.id, parsed.data.invitees);
  }

  await logProposalTransition(db, proposalId, session.user.id, "draft.created");
  revalidatePath("/proposals");

  return { ok: true, message: "Draft saved.", proposalId };
}

/**
 * Updates an existing draft owned by the signed-in user (PC-40).
 */
export async function updateDraftProposalAction(
  input: z.infer<typeof draftProposalSchema> & { proposalId: string },
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = draftProposalSchema
    .extend({ proposalId: z.string().min(1) })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);

  if (!proposal || proposal.proposerId !== session.user.id || proposal.state !== "draft") {
    return { ok: false, message: "Draft not found." };
  }

  const locationCheck = await assertLocationAllowed(
    db,
    session.user.id,
    session.user.role,
    parsed.data.locationId,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const now = new Date().toISOString();
  await db
    .update(proposals)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      proposalType: parsed.data.proposalType,
      locationId: parsed.data.locationId ?? null,
      notes: parsed.data.notes ?? null,
      intentionalSolo: Boolean(parsed.data.intentionalSolo),
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  if (parsed.data.invitees) {
    await replaceInvitees(db, proposal.id, session.user.id, parsed.data.invitees);
  }

  await logProposalTransition(db, proposal.id, session.user.id, "draft.updated");
  revalidatePath("/proposals");

  return { ok: true, message: "Draft updated." };
}

/**
 * Returns true when a sleeping proposal should auto-resolve (sole proposer invitee).
 */
function shouldAutoResolveSleeping(
  proposalType: ProposalType,
  intentionalSolo: boolean,
  requiredInviteeCount: number,
): boolean {
  if (proposalType !== "sleeping") return false;
  return intentionalSolo || requiredInviteeCount === 0;
}

/**
 * Submits a draft to the network — proposed or auto-resolved for solo sleeping (PC-40).
 */
export async function submitProposalAction(
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

  if (!proposal || proposal.proposerId !== session.user.id || proposal.state !== "draft") {
    return { ok: false, message: "Draft not found." };
  }

  if (!proposal.title.trim() || !proposal.description?.trim()) {
    return { ok: false, message: "Title and description are required before submitting." };
  }

  const invitees = await db
    .select()
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const requiredCount = invitees.filter((row) => row.role === "required").length;
  const autoResolve = shouldAutoResolveSleeping(
    proposal.proposalType,
    proposal.intentionalSolo,
    requiredCount,
  );

  const now = new Date().toISOString();
  const nextState: ProposalState = autoResolve ? "resolved" : "proposed";

  await db
    .update(proposals)
    .set({ state: nextState, updatedAt: now })
    .where(eq(proposals.id, proposalId));

  await logProposalTransition(
    db,
    proposalId,
    session.user.id,
    autoResolve ? "proposal.auto_resolved" : "proposal.submitted",
    JSON.stringify({ nextState, requiredInviteeCount: requiredCount }),
  );

  const notificationMessage = autoResolve
    ? `Proposal "${proposal.title}" was auto-approved.`
    : `Proposal "${proposal.title}" needs your review.`;

  const notifyIds = new Set<string>(invitees.map((row) => row.userId));
  for (const userId of notifyIds) {
    await notifyUser(userId, "proposal_submitted", notificationMessage, {
      proposalId,
      proposalTitle: proposal.title,
      proposerId: session.user.id,
      state: nextState,
    });
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return {
    ok: true,
    message: autoResolve
      ? "Sleeping proposal auto-approved and resolved."
      : "Proposal submitted to your network.",
  };
}
