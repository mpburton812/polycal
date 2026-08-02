"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { adminAccessFromSessionUser, adminAccessFromUserRow, userHasAdminAccess, type AdminAccessSession } from "@/lib/admin-access";
import { latestIcsPendingIdsByProposal } from "@/lib/calendar/pending-ics";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { requireNetworkSession } from "@/lib/networks/context";
import {
  locations,
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  users,
  type InviteeRole,
  type InviteeVoteStatus,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import { actorNotifyFields, notifyUser } from "@/lib/notifications";
import { dismissNotificationsForProposal } from "@/actions/notifications";
import { formatConflictMessage } from "@/lib/proposals/conflict-message";
import {
  detectViewerOverlapWarning,
  runProposalEnforcement,
} from "@/lib/proposals/enforcement";
import {
  recordProposalInviteeView,
  shouldRecordProposalInviteeView,
} from "@/lib/proposals/invitee-view";
import {
  getProposalSpecialKind,
  isNonScheduleProposal,
  parseResidencyProposalMeta,
  proposalDescriptionForDisplay,
} from "@/lib/proposals/special-proposals";
import { syncResidencyRowOnSubmit } from "@/actions/residency-proposals";
import {
  sleepingDateToStartIso,
  isoToSleepingDateInput,
  sleepingScheduleFromSlotRows,
} from "@/lib/proposals/sleeping-schedule";
import {
  batchSleepingEntriesSchema,
  parseBatchEntriesJson,
  parseBatchSlotMeta,
  unionBatchInvitees,
  type BatchSleepingEntry,
} from "@/lib/proposals/batch-sleeping";
import {
  createBatchSleepingDraft,
  persistBatchSleepingDraft as persistBatchSleepingDraftCore,
  updateBatchSleepingDraft,
  validateBatchSleepingEntries,
} from "@/lib/proposals/fast-sleeping-core";
import { canProxyVoteForPassiveInvitee, actorCanProxyVoteSync } from "@/lib/proposals/passive-proxy-vote";
import { canManageSleepingAttendees } from "@/lib/proposals/passive-auto-accept";
import { enterAtRiskProposedState } from "@/lib/proposals/services/at-risk";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { wipeProposalVotes } from "@/lib/proposals/services/votes";
import {
  getAcceptedSleepingPartnerIds as loadAcceptedSleepingPartnerIds,
  getAcceptedSleepingPartnerIdsForUsers as loadAcceptedSleepingPartnerIdsForUsers,
  getEligibleLocationIdsForUser as loadEligibleLocationIdsForUser,
  getEligibleLocationIdsForUsers as loadEligibleLocationIdsForUsers,
} from "@/lib/proposals/partners";
import {
  getAdminCanSeeUninvolved,
  isPartnerOnlySleepingViewer,
  viewerCanSeeAuditLog,
  viewerCanSeeProposalWithSleepingGate,
} from "@/lib/proposals/access";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { buildPartnershipProposalCopy } from "@/lib/partnerships/copy";
import type { UserRole } from "@/types/user";

import {
  draftProposalSchema,
  slotVoteSchema,
  voteSchema,
} from "./schemas";
import type {
  ProposalBoard,
  ProposalCard,
  ProposalConflictWarning,
  ProposalDetail,
  ProposalPlaceOption,
  ProposalStateLogView,
  RecurrencePattern,
  RecurrenceRule,
} from "./types";
import { APPROVING_VOTES } from "@/lib/proposals/constants";
import { gatherProposalConflictWarnings } from "@/lib/proposals/services/conflicts";
import {
  buildSleepingProposalTitle,
  evaluateProposalAfterVote,
  resolveProposal,
  scheduleFromSlots,
  syncInviteeAggregateFromSlotVotes,
} from "@/lib/proposals/services/resolution";

function parseRecurrenceRule(raw: string | null): RecurrenceRule | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RecurrenceRule;
    if (!parsed.pattern || !parsed.count) return null;
    return parsed;
  } catch {
    return null;
  }
}

function serializeRecurrenceRule(rule: RecurrenceRule | undefined): string | null {
  if (!rule) return null;
  return JSON.stringify(rule);
}

import { optionalInviteeVotesPending } from "@/lib/proposals/poll-utils";
function advanceOccurrenceDate(date: Date, pattern: RecurrencePattern, interval: number): Date {
  const next = new Date(date);
  switch (pattern) {
    case "daily":
      next.setDate(next.getDate() + interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * interval);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + interval);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      break;
  }
  return next;
}

/** Builds ISO occurrence windows from the first slot and recurrence rule (PC-40). */
function buildRecurrenceOccurrences(
  baseStart: string,
  baseEnd: string | null,
  rule: RecurrenceRule,
): { startAt: string; endAt: string | null }[] {
  const occurrences: { startAt: string; endAt: string | null }[] = [];
  let cursorStart = new Date(baseStart);
  let cursorEnd = baseEnd ? new Date(baseEnd) : null;
  const durationMs =
    cursorEnd && !Number.isNaN(cursorEnd.getTime())
      ? cursorEnd.getTime() - cursorStart.getTime()
      : 0;

  for (let index = 0; index < rule.count; index += 1) {
    const startAt = cursorStart.toISOString();
    const endAt =
      cursorEnd && durationMs > 0
        ? new Date(cursorStart.getTime() + durationMs).toISOString()
        : baseEnd;
    occurrences.push({ startAt, endAt: endAt ?? null });
    if (index < rule.count - 1) {
      cursorStart = advanceOccurrenceDate(cursorStart, rule.pattern, rule.interval);
      if (cursorEnd) {
        cursorEnd = advanceOccurrenceDate(cursorEnd, rule.pattern, rule.interval);
      }
    }
  }
  return occurrences;
}

function slotsFingerprint(
  slots: { startAt: string; endAt?: string | null; label?: string | null }[],
): string {
  return slots
    .map((slot) => `${slot.startAt}|${slot.endAt ?? ""}|${slot.label ?? ""}`)
    .sort()
    .join(";");
}

/** Returns true when time, location, or poll slots changed enough to wipe votes (PC-40). */
function criticalProposalFieldsChanged(
  before: typeof proposals.$inferSelect,
  afterLocationId: string | null,
  afterSlots: { startAt: string; endAt?: string | null; label?: string | null }[],
  beforeSlots: { startAt: string; endAt: string | null; label: string | null }[],
): boolean {
  if ((before.locationId ?? null) !== afterLocationId) return true;
  if (slotsFingerprint(beforeSlots) !== slotsFingerprint(afterSlots)) return true;
  if (
    before.scheduledStartAt &&
    afterSlots[0] &&
    before.scheduledStartAt !== afterSlots[0].startAt
  ) {
    return true;
  }
  return false;
}

/** Parses bedroom label JSON stored on locations (PC-40). */
function parseBedroomNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function mapPlaceOption(row: {
  id: string;
  name: string;
  bedroomCount: number;
  bedroomNames: string | null;
  owners?: string[];
  residents?: string[];
}): ProposalPlaceOption {
  const names = parseBedroomNames(row.bedroomNames);
  return {
    id: row.id,
    name: row.name,
    bedroomCount: row.bedroomCount,
    bedroomNames:
      names.length > 0
        ? names
        : Array.from({ length: row.bedroomCount }, (_, index) => `Bedroom ${index + 1}`),
    owners: row.owners ?? [],
    residents: row.residents ?? [],
  };
}

/**
 * Attaches accepted owner/resident display names to place options (PC-190).
 */
async function enrichPlaceOptionsWithMembers(
  db: ReturnType<typeof getDb>,
  options: ProposalPlaceOption[],
): Promise<ProposalPlaceOption[]> {
  if (options.length === 0) return options;
  const { listAcceptedPlaceMemberNames } = await import("@/lib/places/membership");
  return Promise.all(
    options.map(async (option) => {
      const members = await listAcceptedPlaceMemberNames(db, option.id);
      return { ...option, owners: members.owners, residents: members.residents };
    }),
  );
}

/**
 * Sleeping proposals may only invite accepted sleeping partners (or be solo).
 */
async function assertSleepingInviteesAllowed(
  db: ReturnType<typeof getDb>,
  proposerId: string,
  proposalType: ProposalType,
  intentionalSolo: boolean,
  invitees: { userId: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (proposalType !== "sleeping") return { ok: true };
  if (intentionalSolo || invitees.length === 0) return { ok: true };

  const partners = await loadAcceptedSleepingPartnerIds(db, proposerId);
  for (const invitee of invitees) {
    if (!partners.has(invitee.userId)) {
      return {
        ok: false,
        error:
          "Sleeping arrangements can only include people you have an accepted sleeping partnership with, or be solo.",
      };
    }
  }
  return { ok: true };
}

/**
 * Public list of accepted sleeping partner ids for the signed-in user (proposal UI).
 */
export async function listAcceptedSleepingPartnerIdsAction(): Promise<string[]> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) return [];
  const db = getDb();
  return [...(await loadAcceptedSleepingPartnerIds(db, session.user.id))];
}

/**
 * Places available at invitee residences plus the proposer's network (sleeping location picker).
 */
export async function listSleepingLocationOptionsAction(
  inviteeUserIds: string[],
): Promise<ProposalPlaceOption[]> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) return [];

  const db = getDb();
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  const placeSelect = {
    id: locations.id,
    name: locations.name,
    bedroomCount: locations.bedroomCount,
    bedroomNames: locations.bedroomNames,
  };

  if (isAdmin) {
    const all = await db.select(placeSelect).from(locations).orderBy(asc(locations.name));
    return all.map(mapPlaceOption);
  }

  const userIds = [session.user.id, ...inviteeUserIds];
  const locationIds = await loadEligibleLocationIdsForUsers(db, userIds);
  if (locationIds.length === 0) return [];

  const placeRows = await db
    .select(placeSelect)
    .from(locations)
    .where(inArray(locations.id, locationIds))
    .orderBy(asc(locations.name));

  return placeRows.map(mapPlaceOption);
}

async function persistBatchSleepingDraft(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  entries: BatchSleepingEntry[],
): Promise<void> {
  await persistBatchSleepingDraftCore(db, proposalId, entries);
}

/**
 * Places the current user may attach to a proposal draft (direct + sleeping network residency).
 */
export async function listProposalPlaceOptionsAction(): Promise<ProposalPlaceOption[]> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) return [];

  const db = getDb();
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));

  const placeSelect = {
    id: locations.id,
    name: locations.name,
    bedroomCount: locations.bedroomCount,
    bedroomNames: locations.bedroomNames,
  };

  if (isAdmin) {
    const all = await db.select(placeSelect).from(locations).orderBy(asc(locations.name));
    return enrichPlaceOptionsWithMembers(db, all.map(mapPlaceOption));
  }

  const locationIds = await loadEligibleLocationIdsForUser(db, session.user.id);
  if (locationIds.length === 0) return [];

  const placeRows = await db
    .select(placeSelect)
    .from(locations)
    .where(inArray(locations.id, locationIds))
    .orderBy(asc(locations.name));

  return enrichPlaceOptionsWithMembers(db, placeRows.map(mapPlaceOption));
}

/**
 * All places for residency self-join proposals, with owner/resident names (PC-190).
 */
export async function listResidencyPlaceOptionsAction(): Promise<ProposalPlaceOption[]> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) return [];

  const db = getDb();
  const placeRows = await db
    .select({
      id: locations.id,
      name: locations.name,
      bedroomCount: locations.bedroomCount,
      bedroomNames: locations.bedroomNames,
    })
    .from(locations)
    .orderBy(asc(locations.name));

  return enrichPlaceOptionsWithMembers(db, placeRows.map(mapPlaceOption));
}

/**
 * Validates the viewer may use a location on a proposal.
 */
async function assertLocationAllowed(
  db: ReturnType<typeof getDb>,
  userId: string,
  access: AdminAccessSession | string,
  locationId: string | undefined,
  locationText?: string,
  networkId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (locationId && locationText?.trim()) {
    return { ok: false, error: "Choose either a registered place or custom location text, not both." };
  }
  if (!locationId) return { ok: true };

  const locationFilters = [eq(locations.id, locationId)];
  if (networkId) {
    locationFilters.push(eq(locations.networkId, networkId));
  }
  const [place] = await db
    .select()
    .from(locations)
    .where(and(...locationFilters))
    .limit(1);
  if (!place) {
    return { ok: false, error: "Selected place was not found." };
  }

  const adminAccess =
    typeof access === "string" ? adminAccessFromUserRow({ role: access }) : access;
  if (await userHasAdminAccess(adminAccess)) {
    return { ok: true };
  }

  const eligibleIds = await loadEligibleLocationIdsForUser(db, userId, networkId);
  if (!eligibleIds.includes(locationId)) {
    return {
      ok: false,
      error:
        "You can only schedule at places you or your sleeping partners are associated with.",
    };
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

  if (uniqueInvitees.length === 0) return;

  // Batch insert — one RTT for all invitees (PC-397).
  await db.insert(proposalInvitees).values(
    uniqueInvitees.map((invitee) => ({
      id: `pi-${randomUUID()}`,
      proposalId,
      userId: invitee.userId,
      role: invitee.role,
      voteStatus: "not_seen" as const,
      addedByUserId: proposerId,
      createdAt: now,
    })),
  );
}

async function replaceTimeSlots(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  slots: {
    startAt: string;
    endAt?: string;
    label?: string;
    sortOrder?: number;
    isAllDay?: boolean;
  }[],
): Promise<void> {
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));
  const now = new Date().toISOString();

  if (slots.length === 0) return;

  // Batch insert — one RTT for all slots (PC-397).
  await db.insert(proposalTimeSlots).values(
    slots.map((slot, index) => ({
      id: `pts-${randomUUID()}`,
      proposalId,
      startAt: slot.startAt,
      endAt: slot.endAt ?? null,
      label: slot.label ?? null,
      sortOrder: slot.sortOrder ?? index,
      isAllDay: slot.isAllDay ?? false,
      createdAt: now,
    })),
  );
}

/**
 * Creates child proposal drafts for recurring series occurrences after the parent (PC-40).
 */
async function createRecurringChildProposals(
  db: ReturnType<typeof getDb>,
  parent: typeof proposals.$inferSelect,
  occurrences: { startAt: string; endAt: string | null }[],
  invitees: { userId: string; role: InviteeRole }[],
): Promise<void> {
  const now = new Date().toISOString();
  for (let index = 1; index < occurrences.length; index += 1) {
    const occurrence = occurrences[index];
    const childId = `prop-${randomUUID()}`;
    const label = new Date(occurrence.startAt).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    await db.insert(proposals).values({
      id: childId,
      networkId: parent.networkId,
      title: `${parent.title} — ${label}`,
      description: parent.description,
      proposalType: parent.proposalType,
      state: parent.state,
      proposerId: parent.proposerId,
      locationId: parent.locationId,
      scheduledStartAt: parent.state === "resolved" ? occurrence.startAt : null,
      scheduledEndAt: parent.state === "resolved" ? occurrence.endAt : null,
      intentionalSolo: parent.intentionalSolo,
      eventPrivacy: parent.eventPrivacy,
      isPoll: false,
      isAllDay: parent.isAllDay ?? false,
      parentProposalId: parent.id,
      occurrenceIndex: index,
      isRecurrenceParent: false,
      bedroomIndex: parent.bedroomIndex,
      notes: parent.notes,
      eventIconKey: parent.eventIconKey,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId: childId,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      label,
      sortOrder: 0,
      createdAt: now,
    });

    if (invitees.length > 0) {
      await replaceInvitees(db, childId, parent.proposerId, invitees);
    }

    await logProposalTransition(
      db,
      childId,
      parent.proposerId,
      "proposal.recurrence_child_created",
      JSON.stringify({ parentId: parent.id, occurrenceIndex: index }),
    );
  }
}

/**
 * Detects schedule overlaps for proposer and invitees before submit (PC-40).
 */
export async function checkProposalConflictsAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string; warnings: ProposalConflictWarning[] }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required.", warnings: [] };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal || proposal.proposerId !== session.user.id) {
    return { ok: false, message: "Proposal not found.", warnings: [] };
  }

  const warnings = await gatherProposalConflictWarnings(db, proposal, proposalId);

  return {
    ok: true,
    message: formatConflictMessage(warnings),
    warnings,
  };
}

/**
 * Admin conflict check for proposals owned by another user (PC-118).
 */
export async function adminCheckProposalConflictsAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string; warnings: ProposalConflictWarning[] }> {
  const session = await auth();
  if (!session?.user || !(await userHasAdminAccess(adminAccessFromSessionUser(session.user)))) {
    return { ok: false, message: "Admin access required.", warnings: [] };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal) {
    return { ok: false, message: "Proposal not found.", warnings: [] };
  }

  const warnings = await gatherProposalConflictWarnings(db, proposal, proposalId);

  return {
    ok: true,
    message: formatConflictMessage(warnings),
    warnings,
  };
}

/**
 * Resolves a proposal as an admin actor (PC-118 admin fast sleeping add).
 */
export async function adminForceResolveProposalAction(
  proposalId: string,
  actorUserId: string,
): Promise<{ ok: boolean; message: string }> {
  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal) {
    return { ok: false, message: "Proposal not found." };
  }

  // Await calendar sync so admin Fast sleeping does not rely solely on after() (PC-347).
  await resolveProposal(db, proposal, actorUserId, { awaitCalendarSync: true });

  return { ok: true, message: "Proposal resolved." };
}

/**
 * Creates a new draft proposal for the signed-in user (PC-40).
 */
export async function createDraftProposalAction(
  input: z.infer<typeof draftProposalSchema>,
): Promise<{ ok: boolean; message: string; proposalId?: string }> {
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) {
    return { ok: false, message: networkSession.message };
  }
  const session = { user: networkSession.user };

  const parsed = draftProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const networkId = networkSession.user.activeNetworkId;

  const isBatchSleeping =
    parsed.data.proposalType === "sleeping" && Boolean(parsed.data.isBatchSleeping);
  const batchEntries = parsed.data.batchEntries ?? [];

  if (isBatchSleeping) {
    const [proposerRow] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const validation = await validateBatchSleepingEntries(db, {
      subjectUserId: session.user.id,
      subjectRole: session.user.role,
      entries: batchEntries,
      locationPolicy: "network",
    });
    if (!validation.ok) {
      return { ok: false, message: validation.error };
    }

    const created = await createBatchSleepingDraft(db, {
      proposerId: session.user.id,
      proposerName: proposerRow?.displayName ?? "User",
      actorUserId: session.user.id,
      entries: batchEntries,
      titleState: "draft",
      description: parsed.data.description,
      notes: parsed.data.notes ?? null,
      networkId,
    });

    revalidatePath("/proposals");
    return { ok: true, message: "Draft saved.", proposalId: created.proposalId };
  }

  const locationCheck = await assertLocationAllowed(
    db,
    session.user.id,
    adminAccessFromSessionUser(session.user),
    parsed.data.locationId,
    parsed.data.locationText,
    networkId,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const inviteeCheck = await assertSleepingInviteesAllowed(
    db,
    session.user.id,
    parsed.data.proposalType,
    Boolean(parsed.data.intentionalSolo),
    parsed.data.invitees ?? [],
  );
  if (!inviteeCheck.ok) {
    return { ok: false, message: inviteeCheck.error };
  }

  const now = new Date().toISOString();
  const proposalId = `prop-${randomUUID()}`;
  const intentionalSolo = Boolean(parsed.data.intentionalSolo);
  const isPoll = Boolean(parsed.data.isPoll) || (parsed.data.timeSlots?.length ?? 0) > 1;
  // All-day only applies to timed event proposals (sleeping is already date-only).
  const isAllDay =
    parsed.data.proposalType === "event" && Boolean(parsed.data.isAllDay);
  // Privacy levels were removed (PC-280) — every proposal is "open".
  const eventPrivacy = "open" as const;
  const isRecurring = Boolean(parsed.data.isRecurring && parsed.data.recurrenceRule);
  const recurrenceJson = isRecurring
    ? serializeRecurrenceRule(parsed.data.recurrenceRule)
    : null;
  const locationText = parsed.data.locationText?.trim() || null;
  const batchInvitees = parsed.data.invitees ?? [];

  const [proposerRow] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  let proposalTitle = parsed.data.title;
  if (parsed.data.proposalType === "sleeping") {
    proposalTitle = await buildSleepingProposalTitle(db, {
      proposerName: proposerRow?.displayName ?? "User",
      intentionalSolo,
      locationId: parsed.data.locationId,
      locationText: parsed.data.locationText,
      state: "draft",
      inviteeUserIds: batchInvitees.map((row) => row.userId),
    });
  }

  await db.insert(proposals).values({
    id: proposalId,
    networkId,
    title: proposalTitle,
    description: parsed.data.description,
    proposalType: parsed.data.proposalType,
    state: "draft",
    proposerId: session.user.id,
    locationId: parsed.data.locationId ?? null,
    locationText,
    notes: parsed.data.notes ?? null,
    intentionalSolo,
    isPoll,
    isAllDay,
    eventPrivacy,
    isRecurrenceParent: isRecurring,
    recurrenceRule: recurrenceJson,
    occurrenceIndex: isRecurring ? 0 : null,
    bedroomIndex: parsed.data.bedroomIndex ?? null,
    isBatchSleeping: false,
    batchEntriesJson: null,
    reminderOffsetMinutes:
      parsed.data.proposalType === "event" ? (parsed.data.reminderOffsetMinutes ?? null) : null,
    reminderSentAt: null,
    eventIconKey:
      parsed.data.proposalType === "event" ? (parsed.data.eventIconKey ?? null) : null,
    createdAt: now,
    updatedAt: now,
  });

  if (batchInvitees.length) {
    await replaceInvitees(db, proposalId, session.user.id, batchInvitees);
  }

  if (parsed.data.timeSlots) {
    await replaceTimeSlots(db, proposalId, parsed.data.timeSlots);
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
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) {
    return { ok: false, message: networkSession.message };
  }
  const session = { user: networkSession.user };
  const networkId = networkSession.user.activeNetworkId;

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

  if (!proposal || proposal.state !== "draft" || proposal.networkId !== networkId) {
    return { ok: false, message: "Draft not found." };
  }

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  const isOwner = proposal.proposerId === session.user.id;
  // Match canEdit: proposer or admin may update drafts (PC-375).
  if (!isOwner && !isAdmin) {
    return { ok: false, message: "Draft not found." };
  }

  // Admin edits keep the original proposer's identity for invitee checks;
  // location checks still use the actor session so network admins can pick any place (PC-375 / PC-396).
  const subjectUserId = proposal.proposerId;
  const locationActorAccess = adminAccessFromSessionUser(session.user);

  if (isNonScheduleProposal(proposal.description)) {
    return { ok: false, message: "This draft cannot be edited here." };
  }

  const isBatchSleeping =
    parsed.data.proposalType === "sleeping" &&
    Boolean(parsed.data.isBatchSleeping ?? proposal.isBatchSleeping);
  const batchEntries = parsed.data.batchEntries ?? [];

  if (isBatchSleeping) {
    const validation = await validateBatchSleepingEntries(db, {
      subjectUserId,
      subjectRole: session.user.role as UserRole,
      entries: batchEntries,
      locationPolicy: "network",
    });
    if (!validation.ok) {
      return { ok: false, message: validation.error };
    }

    const [proposerRow] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, subjectUserId))
      .limit(1);

    await updateBatchSleepingDraft(db, {
      proposalId: proposal.id,
      proposerId: subjectUserId,
      proposerName: proposerRow?.displayName ?? "User",
      entries: batchEntries,
    });

    await db
      .update(proposals)
      .set({
        description: parsed.data.description,
        notes: parsed.data.notes ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(proposals.id, proposal.id));

    if (proposal.atRisk) {
      await wipeProposalVotes(db, proposal.id);
    }

    await logProposalTransition(db, proposal.id, session.user.id, "draft.updated");
    revalidatePath("/proposals");
    return { ok: true, message: "Draft updated." };
  }

  const locationCheck = await assertLocationAllowed(
    db,
    subjectUserId,
    locationActorAccess,
    parsed.data.locationId,
    parsed.data.locationText,
    networkId,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const inviteeCheck = await assertSleepingInviteesAllowed(
    db,
    subjectUserId,
    parsed.data.proposalType,
    Boolean(parsed.data.intentionalSolo),
    parsed.data.invitees ?? [],
  );
  if (!inviteeCheck.ok) {
    return { ok: false, message: inviteeCheck.error };
  }

  const now = new Date().toISOString();
  const isPoll =
    parsed.data.isPoll !== undefined
      ? parsed.data.isPoll
      : (parsed.data.timeSlots?.length ?? 0) > 1;
  const isRecurring = Boolean(parsed.data.isRecurring && parsed.data.recurrenceRule);
  const recurrenceJson = isRecurring
    ? serializeRecurrenceRule(parsed.data.recurrenceRule)
    : proposal.recurrenceRule;
  const intentionalSolo = Boolean(parsed.data.intentionalSolo);
  const afterLocationId = parsed.data.locationId ?? null;
  const afterLocationText = parsed.data.locationText?.trim() || null;
  // Privacy levels were removed (PC-280) — every proposal is "open".
  const nextEventPrivacy = "open" as const;

  const existingSlots = await db
    .select({
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
      label: proposalTimeSlots.label,
    })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposal.id));

  const afterSlots =
    parsed.data.timeSlots?.map((slot) => ({
      startAt: slot.startAt,
      endAt: slot.endAt ?? null,
      label: slot.label ?? null,
    })) ?? existingSlots;

  const criticalChanged = criticalProposalFieldsChanged(
    proposal,
    afterLocationId,
    afterSlots,
    existingSlots,
  );

  const [proposerRow] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  let proposalTitle = parsed.data.title;
  if (parsed.data.proposalType === "sleeping") {
    proposalTitle = await buildSleepingProposalTitle(db, {
      proposerName: proposerRow?.displayName ?? "User",
      intentionalSolo,
      locationId: afterLocationId,
      locationText: afterLocationText,
      state: "draft",
      inviteeUserIds: (parsed.data.invitees ?? []).map((row) => row.userId),
    });
  }

  await db
    .update(proposals)
    .set({
      title: proposalTitle,
      description: parsed.data.description,
      proposalType: parsed.data.proposalType,
      locationId: afterLocationId,
      locationText: afterLocationText,
      notes: parsed.data.notes ?? null,
      intentionalSolo,
      isPoll: Boolean(isPoll),
      isAllDay:
        parsed.data.proposalType === "event" && Boolean(parsed.data.isAllDay),
      eventPrivacy: nextEventPrivacy,
      isRecurrenceParent: isRecurring || proposal.isRecurrenceParent,
      recurrenceRule: recurrenceJson,
      bedroomIndex: parsed.data.bedroomIndex ?? proposal.bedroomIndex,
      isBatchSleeping: false,
      batchEntriesJson: null,
      reminderOffsetMinutes:
        parsed.data.proposalType === "event"
          ? (parsed.data.reminderOffsetMinutes ?? proposal.reminderOffsetMinutes ?? null)
          : null,
      reminderSentAt:
        parsed.data.proposalType === "event" &&
        parsed.data.reminderOffsetMinutes !== proposal.reminderOffsetMinutes
          ? null
          : proposal.reminderSentAt,
      eventIconKey:
        parsed.data.proposalType === "event"
          ? (parsed.data.eventIconKey ?? null)
          : null,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  if (parsed.data.invitees) {
    await replaceInvitees(db, proposal.id, session.user.id, parsed.data.invitees);
  }

  if (parsed.data.timeSlots && parsed.data.timeSlots.length > 0) {
    await replaceTimeSlots(db, proposal.id, parsed.data.timeSlots);
  }

  if (criticalChanged || proposal.atRisk) {
    await wipeProposalVotes(db, proposal.id);
  }

  await logProposalTransition(db, proposal.id, session.user.id, "draft.updated");
  revalidatePath("/proposals");

  return { ok: true, message: "Draft updated." };
}

/**
 * Returns true when a proposal should auto-resolve on submit (solo sleeping or no required invitees).
 */
function shouldAutoResolveOnSubmit(
  _proposalType: ProposalType,
  intentionalSolo: boolean,
  requiredInviteeCount: number,
): boolean {
  if (intentionalSolo) return true;
  if (requiredInviteeCount === 0) return false;
  return false;
}

/**
 * Submits a draft to the network — proposed or auto-resolved for solo sleeping (PC-40).
 * Returns conflict warnings unless `confirm` is true.
 */
export async function submitProposalAction(
  proposalId: string,
  confirm = false,
): Promise<{ ok: boolean; message: string; warnings?: ProposalConflictWarning[] }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal || proposal.proposerId !== session.user.id || proposal.state !== "draft") {
    return { ok: false, message: "Draft not found." };
  }

  if (proposal.proposalType !== "sleeping" && !proposal.title.trim()) {
    return { ok: false, message: "Title is required before submitting." };
  }

  const residencyMeta = parseResidencyProposalMeta(proposal.description);
  const isSpecial = isNonScheduleProposal(proposal.description);

  if (!confirm && !isSpecial) {
    const conflictCheck = await checkProposalConflictsAction(proposalId);
    if (conflictCheck.warnings.length > 0) {
      return {
        ok: false,
        message: formatConflictMessage(conflictCheck.warnings),
        warnings: conflictCheck.warnings,
      };
    }
  }

  const invitees = await db
    .select()
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  let requiredCount = invitees.filter((row) => row.role === "required").length;
  let intentionalSolo = proposal.intentionalSolo;
  let optionalCount = invitees.filter((row) => row.role === "optional").length;

  if (proposal.isBatchSleeping) {
    const batchEntries = parseBatchEntriesJson(proposal.batchEntriesJson);
    if (batchEntries.length === 0) {
      return { ok: false, message: "Add at least one night to the batch." };
    }
    const union = unionBatchInvitees(batchEntries);
    requiredCount = union.filter((row) => row.role === "required").length;
    optionalCount = union.filter((row) => row.role === "optional").length;
    intentionalSolo = batchEntries.every((entry) => entry.intentionalSolo);
  }

  if (requiredCount === 0 && !intentionalSolo && optionalCount === 0) {
    return {
      ok: false,
      message: "Add at least one invitee or enable solo before submitting.",
    };
  }

  let autoResolve = shouldAutoResolveOnSubmit(
    proposal.proposalType,
    intentionalSolo,
    requiredCount,
  );

  if (residencyMeta) {
    const [target] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, residencyMeta.targetUserId))
      .limit(1);
    if (target?.role === "passive") {
      autoResolve = true;
    }
  }

  const slots = await db
    .select({ startAt: proposalTimeSlots.startAt, endAt: proposalTimeSlots.endAt })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId));

  const schedule = autoResolve
    ? proposal.proposalType === "sleeping"
      ? sleepingScheduleFromSlotRows(slots)
      : scheduleFromSlots(slots)
    : { start: null, end: null };
  const now = new Date().toISOString();
  const nextState: ProposalState = autoResolve ? "resolved" : "proposed";

  if (proposal.proposalType === "sleeping") {
    const [proposerRow] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, proposal.proposerId))
      .limit(1);
    const batchEntries = parseBatchEntriesJson(proposal.batchEntriesJson);
    const autoTitle = await buildSleepingProposalTitle(db, {
      proposerName: proposerRow?.displayName ?? "User",
      intentionalSolo,
      locationId: proposal.locationId,
      locationText: proposal.locationText,
      state: nextState,
      atRisk: false,
      inviteeUserIds: invitees.map((row) => row.userId),
      batchEntries: proposal.isBatchSleeping ? batchEntries : undefined,
    });
    await db
      .update(proposals)
      .set({ title: autoTitle, updatedAt: new Date().toISOString() })
      .where(eq(proposals.id, proposalId));
    proposal.title = autoTitle;
  }

  if (proposal.atRisk) {
    await wipeProposalVotes(db, proposalId);
  }

  await db
    .update(proposals)
    .set({
      state: nextState,
      scheduledStartAt: schedule.start,
      scheduledEndAt: schedule.end,
      atRisk: false,
      atRiskExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposalId));

  const recurrenceRule = parseRecurrenceRule(proposal.recurrenceRule);
  if (proposal.isRecurrenceParent && recurrenceRule && slots.length > 0) {
    const occurrences = buildRecurrenceOccurrences(
      slots[0].startAt,
      slots[0].endAt,
      recurrenceRule,
    );
    const inviteeRows = invitees.map((row) => ({
      userId: row.userId,
      role: row.role as InviteeRole,
    }));
    const [updatedParent] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .limit(1);
    if (updatedParent) {
      await createRecurringChildProposals(db, updatedParent, occurrences, inviteeRows);
    }
  }

  await logProposalTransition(
    db,
    proposalId,
    session.user.id,
    autoResolve ? "proposal.auto_resolved" : "proposal.submitted",
    JSON.stringify({ nextState, requiredInviteeCount: requiredCount }),
  );

  if (nextState === "proposed") {
    await evaluateProposalAfterVote(db, proposalId, session.user.id);
  }

  const [updatedProposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (updatedProposal) {
    if (autoResolve && isSpecial) {
      await resolveProposal(db, updatedProposal, session.user.id);
    } else if (residencyMeta && !autoResolve) {
      await syncResidencyRowOnSubmit(db, updatedProposal);
    }

    // Intentional-solo auto-resolve flips state above without resolveProposal();
    // still decline collisions and push Google/ICS (PC-337 / PC-345).
    if (autoResolve && !isSpecial) {
      const { autoDeclineCollidingProposals } = await import(
        "@/lib/proposals/services/conflicts"
      );
      await autoDeclineCollidingProposals(
        db,
        updatedProposal,
        updatedProposal.scheduledStartAt,
        updatedProposal.scheduledEndAt,
        session.user.id,
      );
      const { scheduleCalendarSync } = await import("@/lib/calendar/sync");
      await scheduleCalendarSync(updatedProposal.id, "upsert");
    }
  }

  const notificationMessage = autoResolve
    ? `Proposal "${proposal.title}" was auto-approved.`
    : `Proposal "${proposal.title}" needs your review.`;

  if (!(autoResolve && isSpecial)) {
    // Surface the proposed time (resolved schedule, else earliest slot) and
    // location so review notifications carry richer context than the title.
    const earliestSlot = [...slots].sort((a, b) =>
      a.startAt.localeCompare(b.startAt),
    )[0];
    const notifyIds = new Set<string>(invitees.map((row) => row.userId));
    for (const userId of notifyIds) {
      await notifyUser(userId, "proposal_submitted", notificationMessage, {
        proposalId,
        proposalTitle: proposal.title,
        proposerId: session.user.id,
        state: nextState,
        proposalType: proposal.proposalType,
        scheduledStartAt: schedule.start ?? earliestSlot?.startAt ?? undefined,
        scheduledEndAt: schedule.end ?? earliestSlot?.endAt ?? undefined,
        locationText: proposal.locationText ?? undefined,
        isAllDay: proposal.isAllDay ?? undefined,
      });
    }
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  revalidatePath("/people-places");

  return {
    ok: true,
    message: autoResolve
      ? "Proposal auto-approved and resolved."
      : "Proposal submitted to your network.",
  };
}

/**
 * Loads proposal detail for view, edit, or voting (PC-40).
 */
export async function getProposalDetailAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string; detail?: ProposalDetail }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  const adminCanSeeUninvolved = await getAdminCanSeeUninvolved(db);

  const [row] = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      description: proposals.description,
      notes: proposals.notes,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      proposerName: users.displayName,
      locationId: proposals.locationId,
      locationText: proposals.locationText,
      locationName: locations.name,
      intentionalSolo: proposals.intentionalSolo,
      isPoll: proposals.isPoll,
      isAllDay: proposals.isAllDay,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      atRisk: proposals.atRisk,
      winningSlotId: proposals.winningSlotId,
      parentProposalId: proposals.parentProposalId,
      recurrenceRule: proposals.recurrenceRule,
      occurrenceIndex: proposals.occurrenceIndex,
      isRecurrenceParent: proposals.isRecurrenceParent,
      bedroomIndex: proposals.bedroomIndex,
      isBatchSleeping: proposals.isBatchSleeping,
      batchEntriesJson: proposals.batchEntriesJson,
      reminderOffsetMinutes: proposals.reminderOffsetMinutes,
      eventIconKey: proposals.eventIconKey,
      networkId: proposals.networkId,
      locationBedroomNames: locations.bedroomNames,
      locationBedroomCount: locations.bedroomCount,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!row) {
    return { ok: false, message: "Proposal not found." };
  }

  const inviteeRows = await db
    .select({
      userId: proposalInvitees.userId,
      displayName: users.displayName,
      role: proposalInvitees.role,
      voteStatus: proposalInvitees.voteStatus,
      viewedAt: proposalInvitees.viewedAt,
      overlapAcknowledgedAt: proposalInvitees.overlapAcknowledgedAt,
      userRole: users.role,
      addedByUserId: proposalInvitees.addedByUserId,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id))
    .where(eq(proposalInvitees.proposalId, proposalId));

  const inviteeUserIds = inviteeRows.map((invitee) => invitee.userId);
  if (row.state === "draft" && row.proposerId !== session.user.id && !isAdmin) {
    return { ok: false, message: "Proposal not found." };
  }
  if (
    (row.state === "proposed" || row.state === "resolved" || row.state === "archived") &&
    !viewerCanSeeProposalWithSleepingGate(session.user.id, isAdmin, row.proposerId, inviteeUserIds, {
      proposalType: row.proposalType,
      state: row.state,
      adminCanSeeUninvolved,
    })
  ) {
    // Partner-only schedule viewers can see the block but not open detail (PC-399).
    const settings = row.networkId ? await loadNetworkSettings(row.networkId, db) : null;
    if (
      settings?.seePartnersSleepingArrangements &&
      isSleepingLikeType(row.proposalType)
    ) {
      const partnerIds = await loadAcceptedSleepingPartnerIds(
        db,
        session.user.id,
        row.networkId ?? undefined,
      );
      if (
        isPartnerOnlySleepingViewer(
          session.user.id,
          row.proposerId,
          inviteeUserIds,
          partnerIds,
        )
      ) {
        return {
          ok: false,
          message: "You do not have access to this event's detail.",
        };
      }
    }
    return { ok: false, message: "Proposal not found." };
  }

  const display = row;
  const userFacingDescription = proposalDescriptionForDisplay(row.description);
  // Detail dialog never applies schedule sleeping mask (PC-306) — content stays unmasked.

  // Preload sleeping partners for each proxy (passive) invitee so UI can show vote controls (PC-255 / PC-397).
  const proxyPartnerIdsByUser = new Map<string, Set<string>>();
  const passiveUserIds = [
    ...new Set(
      inviteeRows.filter((invitee) => invitee.userRole === "passive").map((invitee) => invitee.userId),
    ),
  ];
  if (passiveUserIds.length > 0) {
    const partnersByUser = await loadAcceptedSleepingPartnerIdsForUsers(db, passiveUserIds);
    for (const userId of passiveUserIds) {
      proxyPartnerIdsByUser.set(userId, partnersByUser.get(userId) ?? new Set());
    }
  }

  const slotRows = await db
    .select()
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId))
    .orderBy(asc(proposalTimeSlots.sortOrder));

  const slotVoteRows = await db
    .select({
      timeSlotId: proposalSlotVotes.timeSlotId,
      userId: proposalSlotVotes.userId,
      displayName: users.displayName,
      voteStatus: proposalSlotVotes.voteStatus,
    })
    .from(proposalSlotVotes)
    .innerJoin(users, eq(proposalSlotVotes.userId, users.id))
    .where(eq(proposalSlotVotes.proposalId, proposalId));

  const viewerInvitee = inviteeRows.find((invitee) => invitee.userId === session.user.id);
  if (
    viewerInvitee &&
    shouldRecordProposalInviteeView({
      proposalState: row.state,
      masked: false,
      isInvitee: true,
      viewedAt: viewerInvitee.viewedAt,
    })
  ) {
    const viewedAt = await recordProposalInviteeView(db, proposalId, session.user.id);
    viewerInvitee.viewedAt = viewedAt;
    const inviteeIndex = inviteeRows.findIndex((invitee) => invitee.userId === session.user.id);
    if (inviteeIndex >= 0) {
      inviteeRows[inviteeIndex].viewedAt = viewedAt;
    }
  }

  const viewerSlotVotes: Record<string, InviteeVoteStatus> = {};
  for (const vote of slotVoteRows.filter((v) => v.userId === session.user.id)) {
    viewerSlotVotes[vote.timeSlotId] = vote.voteStatus;
  }

  const isPollMatrix = row.isPoll && slotRows.length > 1;
  const pollSlotsIncomplete =
    isPollMatrix &&
    slotRows.some((slot) => !viewerSlotVotes[slot.id] || viewerSlotVotes[slot.id] === "not_seen");

  const commentRows = await db
    .select({
      id: proposalComments.id,
      body: proposalComments.body,
      createdAt: proposalComments.createdAt,
      authorName: users.displayName,
      sliceTag: proposalComments.sliceTag,
    })
    .from(proposalComments)
    .innerJoin(users, eq(proposalComments.authorId, users.id))
    .where(and(eq(proposalComments.proposalId, proposalId), isNull(proposalComments.deletedAt)))
    .orderBy(asc(proposalComments.createdAt));

  const logRows = await db
    .select({
      action: proposalStateLog.action,
      details: proposalStateLog.details,
      createdAt: proposalStateLog.createdAt,
      actorName: users.displayName,
    })
    .from(proposalStateLog)
    .leftJoin(users, eq(proposalStateLog.actorUserId, users.id))
    .where(eq(proposalStateLog.proposalId, proposalId))
    .orderBy(asc(proposalStateLog.createdAt));

  const isProposer = row.proposerId === session.user.id;
  const isInvitee = inviteeUserIds.includes(session.user.id);
  const canManage = isProposer || isAdmin;
  const recurrenceRule = parseRecurrenceRule(row.recurrenceRule);

  const stateLogEntries = logRows.map((entry) => ({
    action: entry.action,
    actorName: entry.actorName ?? null,
    details: entry.details ?? null,
    createdAt: entry.createdAt,
  }));

  const hasOverlapWarning = await detectViewerOverlapWarning(
    db,
    proposalId,
    session.user.id,
    viewerInvitee?.voteStatus,
    viewerInvitee?.overlapAcknowledgedAt,
    display.scheduledStartAt ?? null,
    display.scheduledEndAt ?? null,
    row.proposalType,
    row.isAllDay,
  );

  const optionalRsvpPending = optionalInviteeVotesPending(row, viewerInvitee);
  const displayState: ProposalState = optionalRsvpPending ? "proposed" : row.state;
  const batchEntries = parseBatchEntriesJson(row.batchEntriesJson);
  const batchLocationIds = [
    ...new Set(
      batchEntries
        .map((entry) => entry.locationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const batchPlaceRows =
    batchLocationIds.length > 0
      ? await db
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(inArray(locations.id, batchLocationIds))
      : [];
  const batchPlaceNames = Object.fromEntries(
    batchPlaceRows.map((place) => [place.id, place.name]),
  );

  let detailTitle = display.title;
  if (row.proposalType === "sleeping") {
    detailTitle = await buildSleepingProposalTitle(db, {
      proposerName: row.proposerName,
      intentionalSolo: row.intentionalSolo,
      locationId: row.locationId,
      locationText: row.locationText,
      locationName: row.locationName ?? row.locationText,
      state: row.state,
      atRisk: row.atRisk,
      inviteeUserIds: inviteeRows.map((invitee) => invitee.userId),
      batchEntries: batchEntries.length > 0 ? batchEntries : undefined,
    });
  }

  return {
    ok: true,
    message: "Loaded.",
    detail: {
      id: row.id,
      title: detailTitle,
      description: userFacingDescription,
      notes:
        isProposer || isInvitee || isAdmin || row.state === "resolved"
          ? row.notes
          : null,
      proposalType: row.proposalType,
      state: row.state,
      proposerId: row.proposerId,
      proposerName: row.proposerName,
      locationId: row.locationId ?? null,
      locationText: row.locationText ?? null,
      locationName: display.locationName ?? display.locationText ?? null,
      intentionalSolo: row.intentionalSolo,
      isPoll: row.isPoll,
      isAllDay: row.isAllDay,
      scheduledStartAt: display.scheduledStartAt ?? null,
      scheduledEndAt: display.scheduledEndAt ?? null,
      atRisk: row.atRisk,
      isContentMasked: false,
      isRecurring: Boolean(recurrenceRule || row.parentProposalId),
      isRecurrenceParent: row.isRecurrenceParent,
      parentProposalId: row.parentProposalId ?? null,
      recurrenceRule,
      occurrenceIndex: row.occurrenceIndex ?? null,
      bedroomIndex: row.bedroomIndex ?? null,
      bedroomLabel:
        row.proposalType !== "sleeping" || row.bedroomIndex === null
          ? null
          : (() => {
              const names = parseBedroomNames(row.locationBedroomNames);
              const labels =
                names.length > 0
                  ? names
                  : Array.from(
                      { length: row.locationBedroomCount ?? 0 },
                      (_, index) => `Bedroom ${index + 1}`,
                    );
              return labels[row.bedroomIndex!] ?? `Bedroom ${row.bedroomIndex! + 1}`;
            })(),
      isBatchSleeping: row.isBatchSleeping,
      batchEntries,
      batchPlaceNames,
      invitees: inviteeRows.map((invitee) => ({
        userId: invitee.userId,
        displayName: invitee.displayName,
        role: invitee.role,
        voteStatus: invitee.voteStatus,
        viewedAt: invitee.viewedAt ?? null,
        userRole: invitee.userRole,
        addedByUserId: invitee.addedByUserId ?? null,
        canProxyVote:
          invitee.userRole === "passive" &&
          (row.state === "proposed" || row.state === "resolved") &&
          actorCanProxyVoteSync({
            isAdmin,
            actorUserId: session.user.id,
            proposerId: row.proposerId,
            sleepingPartnerIds: proxyPartnerIdsByUser.get(invitee.userId) ?? new Set(),
          }),
      })),
      timeSlots: slotRows.map((slot) => ({
        id: slot.id,
        startAt: slot.startAt,
        endAt: slot.endAt ?? null,
        label: slot.label ?? null,
        isAllDay: slot.isAllDay ?? false,
      })),
      slotVotes: slotVoteRows.map((vote) => ({
        timeSlotId: vote.timeSlotId,
        userId: vote.userId,
        displayName: vote.displayName,
        voteStatus: vote.voteStatus,
      })),
      winningSlotId: row.winningSlotId ?? null,
      comments: commentRows.map((comment) => ({
        id: comment.id,
        authorName: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt,
        sliceTag: comment.sliceTag ?? null,
      })),
      stateLog: stateLogEntries,
      canEdit: row.state === "draft" && (isProposer || isAdmin),
      canVote:
        !isPollMatrix &&
        ((row.state === "proposed" &&
          viewerInvitee !== undefined &&
          viewerInvitee.voteStatus === "not_seen") ||
          (row.state === "resolved" &&
            !row.atRisk &&
            viewerInvitee?.role === "required" &&
            viewerInvitee.voteStatus === "not_seen") ||
          (row.state === "resolved" &&
            row.atRisk &&
            viewerInvitee?.role === "required" &&
            viewerInvitee.voteStatus === "not_seen") ||
          (row.state === "resolved" &&
            viewerInvitee?.role === "optional" &&
            viewerInvitee.voteStatus === "not_seen")),
      canVoteSlots:
        isPollMatrix &&
        viewerInvitee !== undefined &&
        (row.state === "proposed" || (row.state === "resolved" && viewerInvitee.role === "optional")) &&
        pollSlotsIncomplete,
      canManageAttendees:
        row.state === "resolved" &&
        (row.proposalType === "sleeping"
          ? canManageSleepingAttendees(isProposer, isAdmin)
          : isProposer || isAdmin || isInvitee),
      canComment:
        row.state !== "draft" &&
        row.state !== "archived" &&
        viewerCanSeeProposalWithSleepingGate(session.user.id, isAdmin, row.proposerId, inviteeUserIds, {
          proposalType: row.proposalType,
          state: row.state,
          adminCanSeeUninvolved,
        }),
      canCancel: canManage && (row.state === "proposed" || row.state === "resolved"),
      canAdminDeleteProposal: isAdmin,
      canRedraft: isProposer && row.state === "resolved",
      canReschedule:
        isAdmin &&
        (row.state === "proposed" || row.state === "resolved") &&
        !row.isBatchSleeping,
      canRevokeAcceptance:
        viewerInvitee?.role === "required" &&
        row.state === "resolved" &&
        !row.atRisk &&
        Boolean(
          viewerInvitee?.voteStatus &&
            APPROVING_VOTES.includes(viewerInvitee.voteStatus as InviteeVoteStatus),
        ),
      viewerVoteStatus: viewerInvitee?.voteStatus ?? null,
      viewerSlotVotes,
      hasOverlapWarning,
      canAcknowledgeOverlap: hasOverlapWarning,
      optionalRsvpPending,
      displayState,
      reminderOffsetMinutes: row.reminderOffsetMinutes ?? null,
      eventIconKey: row.proposalType !== "event" ? null : row.eventIconKey ?? null,
      specialKind: getProposalSpecialKind(row.description) ?? undefined,
      pendingIcsId: (
        await latestIcsPendingIdsByProposal(db, session.user.id, [row.id])
      ).get(row.id) ?? null,
    },
  };
}

const overlapResponseSchema = z.object({
  proposalId: z.string().min(1),
  response: z.enum(["acknowledge", "decline"]),
});

/**
 * Acknowledges or declines an in-flight calendar overlap after voting (PC-46).
 */
export async function acknowledgeProposalOverlapAction(
  input: z.infer<typeof overlapResponseSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = overlapResponseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid overlap response." };
  }

  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);
  if (!proposal || proposal.state === "draft" || proposal.state === "archived") {
    return { ok: false, message: "Proposal not found." };
  }

  const [invitee] = await db
    .select()
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, parsed.data.proposalId),
        eq(proposalInvitees.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!invitee || invitee.voteStatus === "not_seen") {
    return { ok: false, message: "You have not voted on this proposal yet." };
  }

  const hasOverlap = await detectViewerOverlapWarning(
    db,
    proposal.id,
    session.user.id,
    invitee.voteStatus,
    invitee.overlapAcknowledgedAt,
    proposal.scheduledStartAt,
    proposal.scheduledEndAt,
    proposal.proposalType,
    proposal.isAllDay,
  );

  if (!hasOverlap) {
    return { ok: false, message: "No active overlap warning for this proposal." };
  }

  const now = new Date().toISOString();
  const actor = actorNotifyFields(session.user);

  if (parsed.data.response === "acknowledge") {
    await db
      .update(proposalInvitees)
      .set({ overlapAcknowledgedAt: now })
      .where(eq(proposalInvitees.id, invitee.id));

    await logProposalTransition(
      db,
      proposal.id,
      session.user.id,
      "proposal.overlap_acknowledged",
      "Viewer acknowledged schedule conflict after voting.",
    );

    revalidatePath("/proposals");
    revalidatePath("/schedule");
    return { ok: true, message: "Overlap acknowledged. Your vote stands." };
  }

  await db
    .update(proposalInvitees)
    .set({
      voteStatus: "decline",
      respondedAt: now,
      overlapAcknowledgedAt: null,
    })
    .where(eq(proposalInvitees.id, invitee.id));

  await logProposalTransition(
    db,
    proposal.id,
    session.user.id,
    "proposal.overlap_declined",
    "Viewer declined after schedule conflict was detected.",
  );

  await notifyUser(
    proposal.proposerId,
    "proposal_vote_cast",
    `${actor.actorDisplayName} changed their vote to decline on "${proposal.title}" after a schedule conflict.`,
    {
      proposalId: proposal.id,
      voterId: session.user.id,
      vote: "decline",
      proposalType: proposal.proposalType,
      ...actor,
    },
  );

  if (invitee.role === "required") {
    if (proposal.state === "proposed" || (proposal.state === "resolved" && proposal.atRisk)) {
      await evaluateProposalAfterVote(db, proposal.id, session.user.id);
    } else if (proposal.state === "resolved") {
      await enterAtRiskProposedState(
        db,
        proposal,
        session.user.id,
        "A required invitee declined after a schedule conflict.",
      );
    }
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  return { ok: true, message: "Vote changed to decline due to schedule conflict." };
}

/**
 * Records an invitee vote (or a proxy vote for a passive invitee the actor added) (PC-40 / PC-246).
 */
export async function castProposalVoteAction(
  input: z.infer<typeof voteSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid vote." };
  }

  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);
  if (!proposal) {
    return { ok: false, message: "Proposal is not open for voting." };
  }

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  const targetUserId = parsed.data.onBehalfOfUserId ?? session.user.id;
  const isProxy = Boolean(parsed.data.onBehalfOfUserId);

  const [invitee] = await db
    .select()
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, parsed.data.proposalId),
        eq(proposalInvitees.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!invitee) {
    return {
      ok: false,
      message: isProxy
        ? "That person is not an invitee on this proposal."
        : "You are not an invitee on this proposal.",
    };
  }

  let proxyDisplayName: string | null = null;
  if (isProxy) {
    const proxyCheck = await canProxyVoteForPassiveInvitee(db, {
      inviteeUserId: targetUserId,
      actorUserId: session.user.id,
      isAdmin,
      proposerId: proposal.proposerId,
    });
    if (!proxyCheck.ok) {
      return { ok: false, message: proxyCheck.message };
    }
    proxyDisplayName = proxyCheck.displayName;
  }

  const isOptionalResolvedVote = proposal.state === "resolved" && invitee.role === "optional";
  const isAtRiskRequiredVote =
    proposal.state === "resolved" && proposal.atRisk && invitee.role === "required";
  const isPendingRequiredOnResolved =
    proposal.state === "resolved" && !proposal.atRisk && invitee.role === "required";
  const isProposedVote = proposal.state === "proposed";

  const alreadyVoted = invitee.voteStatus !== "not_seen";
  if (alreadyVoted && !isProxy) {
    return { ok: false, message: "You have already voted on this proposal." };
  }

  if (
    !isOptionalResolvedVote &&
    !isAtRiskRequiredVote &&
    !isPendingRequiredOnResolved &&
    !isProposedVote
  ) {
    return { ok: false, message: "Proposal is not open for voting." };
  }

  const slotCount = (
    await db
      .select({ id: proposalTimeSlots.id })
      .from(proposalTimeSlots)
      .where(eq(proposalTimeSlots.proposalId, proposal.id))
  ).length;

  if (proposal.isPoll && slotCount > 1) {
    return { ok: false, message: "Use per-slot voting for poll proposals." };
  }

  const now = new Date().toISOString();
  const actor = actorNotifyFields(session.user);
  await db
    .update(proposalInvitees)
    .set({
      voteStatus: parsed.data.vote,
      respondedAt: now,
    })
    .where(eq(proposalInvitees.id, invitee.id));

  await logProposalTransition(
    db,
    proposal.id,
    session.user.id,
    isProxy ? "proposal.passive_proxy_vote" : "proposal.vote_cast",
    JSON.stringify({
      vote: parsed.data.vote,
      role: invitee.role,
      ...(isProxy
        ? {
            onBehalfOfUserId: targetUserId,
            displayName: proxyDisplayName,
            message: `Voted ${parsed.data.vote} for ${proxyDisplayName}`,
          }
        : {}),
    }),
  );

  await notifyUser(proposal.proposerId, "proposal_vote_cast", `${actor.actorDisplayName} cast a vote on "${proposal.title}".`, {
    proposalId: proposal.id,
    voterId: session.user.id,
    vote: parsed.data.vote,
    proposalType: proposal.proposalType,
    ...(isProxy ? { onBehalfOfUserId: targetUserId } : {}),
    ...actor,
  });

  if (invitee.role === "required") {
    await evaluateProposalAfterVote(db, proposal.id, session.user.id);
  }

  await dismissNotificationsForProposal(session.user.id, proposal.id);

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return {
    ok: true,
    message: isProxy ? `Vote recorded for ${proxyDisplayName}.` : "Vote recorded.",
  };
}

/**
 * Records a per-slot poll matrix vote and syncs aggregate status (PC-40).
 */
export async function castSlotVoteAction(
  input: z.infer<typeof slotVoteSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = slotVoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid vote." };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);

  if (!proposal || !proposal.isPoll) {
    return { ok: false, message: "Not a poll proposal." };
  }

  const [invitee] = await db
    .select()
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, parsed.data.proposalId),
        eq(proposalInvitees.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!invitee) {
    return { ok: false, message: "You are not an invitee on this proposal." };
  }

  const canVoteNow =
    proposal.state === "proposed" ||
    (proposal.state === "resolved" && invitee.role === "optional");

  if (!canVoteNow) {
    return { ok: false, message: "Poll voting is closed." };
  }

  const [slot] = await db
    .select({ id: proposalTimeSlots.id })
    .from(proposalTimeSlots)
    .where(
      and(
        eq(proposalTimeSlots.id, parsed.data.timeSlotId),
        eq(proposalTimeSlots.proposalId, parsed.data.proposalId),
      ),
    )
    .limit(1);

  if (!slot) {
    return { ok: false, message: "Time slot not found." };
  }

  const now = new Date().toISOString();
  const [existing] = await db
    .select({ id: proposalSlotVotes.id })
    .from(proposalSlotVotes)
    .where(
      and(
        eq(proposalSlotVotes.timeSlotId, parsed.data.timeSlotId),
        eq(proposalSlotVotes.userId, session.user.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(proposalSlotVotes)
      .set({ voteStatus: parsed.data.vote, respondedAt: now })
      .where(eq(proposalSlotVotes.id, existing.id));
  } else {
    await db.insert(proposalSlotVotes).values({
      id: `psv-${randomUUID()}`,
      proposalId: parsed.data.proposalId,
      timeSlotId: parsed.data.timeSlotId,
      userId: session.user.id,
      voteStatus: parsed.data.vote,
      respondedAt: now,
      createdAt: now,
    });
  }

  await logProposalTransition(
    db,
    proposal.id,
    session.user.id,
    "proposal.slot_vote_cast",
    JSON.stringify({ timeSlotId: parsed.data.timeSlotId, vote: parsed.data.vote }),
  );

  await syncInviteeAggregateFromSlotVotes(db, proposal.id, session.user.id);

  if (invitee.role === "required" && proposal.state === "proposed") {
    await evaluateProposalAfterVote(db, proposal.id, session.user.id);
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Slot vote recorded." };
}

// Resolved-proposal lifecycle actions (cancel/redraft/reschedule/attendees/nudge)
// and proposal comment actions live in ./lifecycle and ./comments (PC-329 carve).
