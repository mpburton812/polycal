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
import { legacyRolesForUsers } from "@/lib/networks/membership";
import { listNetworkPickerPlaces } from "@/lib/places/list-network-picker-places";
import {
  locations,
  networkMembers,
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
import { resolveTimezone } from "@/lib/schedule/timezone";
import {
  submitNotificationMessage,
  submitResultMessage,
} from "@/lib/proposals/submit-copy";
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
import { assertComposerPostingRules } from "@/lib/proposals/composer-posting-rules";
import { bookingsEnabled } from "@/types/network-settings";
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


/**
 * Public list of accepted sleeping partner ids for the signed-in user, or for a
 * Booking-for subject the actor is allowed to proxy (PC-494).
 */

import {
  assertSleepingInviteesAllowed,
  buildRecurrenceOccurrences,
  criticalProposalFieldsChanged,
  mapPlaceOption,
  parseRecurrenceRule,
  serializeRecurrenceRule,
} from "./_helpers";

import { checkProposalConflictsAction } from "./_reads";
import { assertLocationAllowed, createRecurringChildProposals, deleteRecurringChildProposals, loadAllowedProxyUserIds, replaceInvitees, replaceTimeSlots, validateComposerPosting } from "./_shared";

/**
 * Creates a draft proposal owned by the signed-in user (PC-40).
 */
export async function createDraftProposalAction(
  input: z.infer<typeof draftProposalSchema>,
): Promise<{ ok: boolean; message: string; proposalId?: string; errorEntryId?: string }> {
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
      return { ok: false, message: validation.error, errorEntryId: validation.errorEntryId };
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

  const postingKind = parsed.data.postingKind === "booking" ? "booking" : "proposal";
  const partnerSubjectId =
    postingKind === "booking" && parsed.data.onBehalfOfUserId
      ? parsed.data.onBehalfOfUserId
      : session.user.id;
  const inviteeCheck = await assertSleepingInviteesAllowed(
    db,
    partnerSubjectId,
    parsed.data.proposalType,
    Boolean(parsed.data.intentionalSolo),
    parsed.data.invitees ?? [],
  );
  if (!inviteeCheck.ok) {
    return { ok: false, message: inviteeCheck.error };
  }

  const isPoll =
    postingKind === "booking"
      ? false
      : Boolean(parsed.data.isPoll) || (parsed.data.timeSlots?.length ?? 0) > 1;
  const composerCheck = await validateComposerPosting(
    db,
    networkId,
    session.user.id,
    {
      isPoll,
      postingKind,
      onBehalfOfUserId: parsed.data.onBehalfOfUserId,
    },
    false,
  );
  if (!composerCheck.ok) {
    return { ok: false, message: composerCheck.error };
  }

  const now = new Date().toISOString();
  const proposalId = `prop-${randomUUID()}`;
  const intentionalSolo = Boolean(parsed.data.intentionalSolo);
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
    scheduleColor:
      parsed.data.proposalType === "event" ? (parsed.data.scheduleColor ?? null) : null,
    postToFeed: Boolean(parsed.data.postToFeed),
    postingKind,
    onBehalfOfUserId:
      postingKind === "booking" && parsed.data.onBehalfOfUserId
        ? parsed.data.onBehalfOfUserId
        : null,
    tentative: Boolean(parsed.data.tentative),
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
): Promise<{ ok: boolean; message: string; errorEntryId?: string }> {
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
      return { ok: false, message: validation.error, errorEntryId: validation.errorEntryId };
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

  const now = new Date().toISOString();
  const postingKind = parsed.data.postingKind === "booking" ? "booking" : "proposal";
  const partnerSubjectId =
    postingKind === "booking" && parsed.data.onBehalfOfUserId
      ? parsed.data.onBehalfOfUserId
      : subjectUserId;
  const inviteeCheck = await assertSleepingInviteesAllowed(
    db,
    partnerSubjectId,
    parsed.data.proposalType,
    Boolean(parsed.data.intentionalSolo),
    parsed.data.invitees ?? [],
  );
  if (!inviteeCheck.ok) {
    return { ok: false, message: inviteeCheck.error };
  }

  const isPoll =
    postingKind === "booking"
      ? false
      : parsed.data.isPoll !== undefined
        ? parsed.data.isPoll
        : (parsed.data.timeSlots?.length ?? 0) > 1;
  const composerCheck = await validateComposerPosting(
    db,
    networkId,
    session.user.id,
    {
      isPoll,
      postingKind,
      onBehalfOfUserId: parsed.data.onBehalfOfUserId,
    },
    Boolean(proposal.isPoll),
  );
  if (!composerCheck.ok) {
    return { ok: false, message: composerCheck.error };
  }
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
      scheduleColor:
        parsed.data.proposalType === "event"
          ? (parsed.data.scheduleColor ?? null)
          : null,
      postToFeed:
        parsed.data.postToFeed !== undefined
          ? Boolean(parsed.data.postToFeed)
          : proposal.postToFeed,
      postingKind,
      onBehalfOfUserId:
        postingKind === "booking" && parsed.data.onBehalfOfUserId
          ? parsed.data.onBehalfOfUserId
          : null,
      tentative: Boolean(parsed.data.tentative),
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
  postingKind?: string,
): boolean {
  if (postingKind === "booking") return true;
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

  if (!confirm) {
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

  if (
    proposal.postingKind !== "booking" &&
    requiredCount === 0 &&
    !intentionalSolo &&
    optionalCount === 0
  ) {
    return {
      ok: false,
      message: "Add at least one invitee or enable solo before submitting.",
    };
  }

  const autoResolve = shouldAutoResolveOnSubmit(
    proposal.proposalType,
    intentionalSolo,
    requiredCount,
    proposal.postingKind,
  );

  const slots = await db
    .select({ startAt: proposalTimeSlots.startAt, endAt: proposalTimeSlots.endAt })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId));

  const [proposerTz] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, proposal.proposerId))
    .limit(1);
  const proposerTimeZone = resolveTimezone(proposerTz?.timezone);
  const networkSettings = proposal.networkId
    ? await loadNetworkSettings(proposal.networkId, db)
    : null;
  const schedulingPosting = networkSettings?.schedulingPosting ?? "proposals_only";

  const schedule = autoResolve
    ? proposal.proposalType === "sleeping"
      ? sleepingScheduleFromSlotRows(slots, proposerTimeZone)
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

  if (proposal.postingKind === "booking" && invitees.length > 0) {
    await db
      .update(proposalInvitees)
      .set({ voteStatus: "accept", respondedAt: now })
      .where(eq(proposalInvitees.proposalId, proposalId));
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
      // Re-submit must not stack duplicate child rows for the same series (PC-494).
      await deleteRecurringChildProposals(db, updatedParent.id);
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

  if (updatedProposal && autoResolve) {
    // Intentional-solo auto-resolve flips state above without resolveProposal();
    // still decline collisions and push Google/ICS (PC-337 / PC-345).
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

  const actor = actorNotifyFields(session.user);
  const notificationMessage = submitNotificationMessage({
    autoResolve,
    schedulingPosting,
    actorDisplayName: actor.actorDisplayName,
    title: proposal.title,
  });

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
      ...actor,
      state: nextState,
      proposalType: proposal.proposalType,
      scheduledStartAt: schedule.start ?? earliestSlot?.startAt ?? undefined,
      scheduledEndAt: schedule.end ?? earliestSlot?.endAt ?? undefined,
      locationText: proposal.locationText ?? undefined,
      isAllDay: proposal.isAllDay ?? undefined,
    });
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  revalidatePath("/people-places");

  return {
    ok: true,
    message: submitResultMessage({ autoResolve, schedulingPosting }),
  };
}
