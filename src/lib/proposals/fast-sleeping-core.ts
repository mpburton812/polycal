import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import {
  locations,
  proposalInvitees,
  proposalSlotVotes,
  proposalTimeSlots,
  proposals,
  users,
  type InviteeRole,
  type ProposalState,
} from "@/lib/db/schema";
import {
  encodeBatchSlotMeta,
  unionBatchInvitees,
  type BatchSleepingEntry,
} from "@/lib/proposals/batch-sleeping";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import { sleepingDateToStartIso } from "@/lib/proposals/sleeping-schedule";
import {
  getAcceptedSleepingPartnerIds,
  getEligibleLocationIdsForUser,
} from "@/lib/proposals/partners";
import { resolveTimezone } from "@/lib/schedule/timezone";
import type { UserRole } from "@/types/user";

export type BatchLocationPolicy = "network" | "exists";

type Db = ReturnType<typeof getDb>;

export { getAcceptedSleepingPartnerIds, getEligibleLocationIdsForUser };

/**
 * Validates sleeping invitees are accepted partners of the subject (or solo).
 */
export async function assertSleepingInviteesForSubject(
  db: Db,
  subjectUserId: string,
  intentionalSolo: boolean,
  invitees: { userId: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (intentionalSolo || invitees.length === 0) return { ok: true };

  const partners = await getAcceptedSleepingPartnerIds(db, subjectUserId);
  for (const invitee of invitees) {
    if (!partners.has(invitee.userId)) {
      return {
        ok: false,
        error:
          "Sleeping arrangements can only include people with an accepted sleeping partnership, or be solo.",
      };
    }
  }
  return { ok: true };
}

/**
 * Validates location for a batch night under network eligibility or existence-only policy.
 */
export async function assertBatchLocationAllowed(
  db: Db,
  subjectUserId: string,
  role: string,
  locationPolicy: BatchLocationPolicy,
  locationId: string | undefined,
  locationText?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (locationId && locationText?.trim()) {
    return { ok: false, error: "Choose either a registered place or custom location text, not both." };
  }
  if (!locationId) return { ok: true };

  const [place] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!place) {
    return { ok: false, error: "Selected place was not found." };
  }

  if (locationPolicy === "exists") {
    return { ok: true };
  }

  if (await userHasAdminAccess(role as UserRole)) {
    return { ok: true };
  }

  const eligibleIds = await getEligibleLocationIdsForUser(db, subjectUserId);
  if (!eligibleIds.includes(locationId)) {
    return {
      ok: false,
      error:
        "You can only schedule at places you or your sleeping partners are associated with.",
    };
  }

  return { ok: true };
}

/**
 * Validates all batch entries for partners, solo rules, and location policy (PC-115).
 */
export async function validateBatchSleepingEntries(
  db: Db,
  input: {
    subjectUserId: string;
    subjectRole: string;
    entries: BatchSleepingEntry[];
    locationPolicy: BatchLocationPolicy;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.entries.length === 0) {
    return { ok: false, error: "Configure at least one night before submitting." };
  }

  for (const entry of input.entries) {
    const inviteeCheck = await assertSleepingInviteesForSubject(
      db,
      input.subjectUserId,
      Boolean(entry.intentionalSolo),
      entry.invitees,
    );
    if (!inviteeCheck.ok) {
      return inviteeCheck;
    }

    if (!entry.intentionalSolo && entry.invitees.length === 0) {
      return {
        ok: false,
        error: "Each configured night needs partners or intentional solo.",
      };
    }

    if (entry.locationId || entry.locationText) {
      const locationCheck = await assertBatchLocationAllowed(
        db,
        input.subjectUserId,
        input.subjectRole,
        input.locationPolicy,
        entry.locationId,
        entry.locationText,
      );
      if (!locationCheck.ok) {
        return locationCheck;
      }
    }
  }

  return { ok: true };
}

/** Replaces proposal invitees for a batch sleeping draft. */
export async function replaceBatchInvitees(
  db: Db,
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
 * Loads the proposer's IANA timezone so civil night dates map to midnight in
 * their zone (not the server default America/New_York).
 */
async function loadUserTimezone(db: Db, userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return resolveTimezone(row?.timezone);
}

/** Writes per-night time slots with batch metadata for a sleeping draft. */
export async function persistBatchSleepingDraft(
  db: Db,
  proposalId: string,
  entries: BatchSleepingEntry[],
  timeZone?: string,
): Promise<void> {
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));

  const tz = resolveTimezone(timeZone);
  const now = new Date().toISOString();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const nightDate = entry.nightDate.slice(0, 10);
    const startIso = sleepingDateToStartIso(nightDate, tz);
    if (!startIso) {
      throw new Error("Invalid batch night date.");
    }
    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId,
      startAt: startIso,
      endAt: null,
      label: encodeBatchSlotMeta({
        batchEntryId: entry.id,
        locationId: entry.locationId,
        locationText: entry.locationText,
        bedroomIndex: entry.bedroomIndex,
        intentionalSolo: entry.intentionalSolo,
        inviteeUserIds: entry.intentionalSolo
          ? []
          : entry.invitees.map((invitee) => invitee.userId),
      }),
      sortOrder: index,
      isAllDay: false,
      createdAt: now,
    });
  }
}

async function buildBatchSleepingTitle(
  db: Db,
  input: {
    proposerName: string;
    intentionalSolo: boolean;
    batchEntries: BatchSleepingEntry[];
    inviteeUserIds: string[];
    state: ProposalState | "draft";
  },
): Promise<string> {
  let inviteeNames: string[] = [];
  if (!input.intentionalSolo && input.inviteeUserIds.length > 0) {
    const rows = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, input.inviteeUserIds));
    inviteeNames = rows.map((row) => row.displayName);
  }

  let locationName: string | null = null;
  const firstLocated = input.batchEntries.find(
    (entry) => entry.locationId || entry.locationText?.trim(),
  );
  if (firstLocated?.locationText?.trim()) {
    locationName = firstLocated.locationText.trim();
  } else if (firstLocated?.locationId) {
    const [place] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, firstLocated.locationId))
      .limit(1);
    locationName = place?.name ?? null;
  }

  return formatSleepingDisplayTitle({
    proposerName: input.proposerName,
    inviteeNames,
    intentionalSolo: input.intentionalSolo,
    locationName,
    state: input.state,
    atRisk: false,
  });
}

export interface CreateBatchSleepingDraftInput {
  proposerId: string;
  proposerName: string;
  actorUserId: string;
  entries: BatchSleepingEntry[];
  /** Title state label — draft for user path, resolved for admin preview titles. */
  titleState?: ProposalState | "draft";
  description?: string | null;
  notes?: string | null;
}

export interface CreateBatchSleepingDraftResult {
  proposalId: string;
  title: string;
  intentionalSolo: boolean;
}

/**
 * Inserts a batch sleeping draft owned by proposerId and logs draft.created (PC-115).
 */
export async function createBatchSleepingDraft(
  db: Db,
  input: CreateBatchSleepingDraftInput,
): Promise<CreateBatchSleepingDraftResult> {
  const intentionalSolo = input.entries.every((entry) => entry.intentionalSolo);
  const batchInvitees = unionBatchInvitees(input.entries);
  const proposalId = `prop-${randomUUID()}`;
  const now = new Date().toISOString();
  const titleState = input.titleState ?? "draft";

  const title = await buildBatchSleepingTitle(db, {
    proposerName: input.proposerName,
    intentionalSolo,
    batchEntries: input.entries,
    inviteeUserIds: batchInvitees.map((row) => row.userId),
    state: titleState,
  });

  await db.insert(proposals).values({
    id: proposalId,
    title,
    description: input.description ?? null,
    proposalType: "sleeping",
    state: "draft",
    proposerId: input.proposerId,
    locationId: null,
    locationText: null,
    notes: input.notes ?? null,
    intentionalSolo,
    isPoll: false,
    isAllDay: false,
    eventPrivacy: "open",
    isRecurrenceParent: false,
    recurrenceRule: null,
    occurrenceIndex: null,
    bedroomIndex: null,
    isBatchSleeping: true,
    batchEntriesJson: JSON.stringify(input.entries),
    reminderOffsetMinutes: null,
    reminderSentAt: null,
    eventIconKey: null,
    createdAt: now,
    updatedAt: now,
  });

  await replaceBatchInvitees(db, proposalId, input.proposerId, batchInvitees);
  const proposerTz = await loadUserTimezone(db, input.proposerId);
  await persistBatchSleepingDraft(db, proposalId, input.entries, proposerTz);
  await logProposalTransition(db, proposalId, input.actorUserId, "draft.created");

  return { proposalId, title, intentionalSolo };
}

/**
 * Updates an existing batch sleeping draft's entries, invitees, and title fields.
 */
export async function updateBatchSleepingDraft(
  db: Db,
  input: {
    proposalId: string;
    proposerId: string;
    proposerName: string;
    entries: BatchSleepingEntry[];
  },
): Promise<{ title: string; intentionalSolo: boolean }> {
  const intentionalSolo = input.entries.every((entry) => entry.intentionalSolo);
  const batchInvitees = unionBatchInvitees(input.entries);
  const title = await buildBatchSleepingTitle(db, {
    proposerName: input.proposerName,
    intentionalSolo,
    batchEntries: input.entries,
    inviteeUserIds: batchInvitees.map((row) => row.userId),
    state: "draft",
  });

  const now = new Date().toISOString();
  await db
    .update(proposals)
    .set({
      title,
      intentionalSolo,
      isBatchSleeping: true,
      batchEntriesJson: JSON.stringify(input.entries),
      locationId: null,
      locationText: null,
      bedroomIndex: null,
      updatedAt: now,
    })
    .where(eq(proposals.id, input.proposalId));

  await replaceBatchInvitees(db, input.proposalId, input.proposerId, batchInvitees);
  const proposerTz = await loadUserTimezone(db, input.proposerId);
  await persistBatchSleepingDraft(db, input.proposalId, input.entries, proposerTz);

  return { title, intentionalSolo };
}
