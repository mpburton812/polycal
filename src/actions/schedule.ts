"use server";

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { requireSession, withDb } from "@/lib/actions/context";
import { getDb } from "@/lib/db/client";
import {
  locations,
  polyGroup,
  proposalInvitees,
  proposalTimeSlots,
  proposals,
  sleepingPartnerships,
  users,
  type EventPrivacyLevel,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import { eventInRange, intervalsOverlap } from "@/lib/schedule/dates";
import { buildScheduleWindows } from "@/lib/schedule/schedule-slices";
import type { ScheduleSliceKind } from "@/lib/schedule/slice-types";
import { parseBatchSlotMeta } from "@/lib/proposals/batch-sleeping";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import {
  getPrivacyAdminFlags,
  MASKED_TITLE,
  viewerCanSeeProposal,
} from "@/lib/proposals/access";
import { applyScheduleMasking } from "@/lib/schedule/slice-auth";

const HIDDEN_SLEEPING_TITLE = "Sleeping arrangement";

const rangeSchema = z.object({
  rangeStart: z.string().min(1),
  rangeEnd: z.string().min(1),
});

export type ScheduleFilterMode = "whole" | "solo" | "sleeping_network" | "person";

export interface ScheduleEvent {
  id: string;
  proposalId: string;
  title: string;
  startAt: string;
  endAt: string | null;
  proposalType: ProposalType;
  state: "proposed" | "resolved" | "archived";
  proposerId: string;
  proposerName: string;
  locationName: string | null;
  participantIds: string[];
  participantNames: string[];
  intentionalSolo: boolean;
  isContentMasked: boolean;
  isTentative: boolean;
  atRisk: boolean;
  hasOverlap: boolean;
  isPoll: boolean;
  isAllDay: boolean;
  slotLabel: string | null;
  sliceKind: ScheduleSliceKind;
  rootProposalId: string;
  sliceKey: string;
  slotId: string | null;
  occurrenceProposalId: string | null;
  /** Category icon key; omitted when content is masked (PC-116). */
  eventIconKey: string | null;
}

export interface SchedulePlanningItem {
  id: string;
  title: string;
  state: ProposalState;
  proposalType: ProposalType;
  scheduledStartAt: string | null;
}

export interface SchedulePayload {
  events: ScheduleEvent[];
  planningItems: SchedulePlanningItem[];
}

async function getSchedulePrivacyFlags(
  db: ReturnType<typeof getDb>,
): Promise<{ adminCanSeePrivate: boolean; adminCanSeeSuperPrivate: boolean; hideSleeping: boolean }> {
  const privacy = await getPrivacyAdminFlags(db);
  const [group] = await db
    .select({ hideSleepingArrangements: polyGroup.hideSleepingArrangements })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  return {
    ...privacy,
    hideSleeping: group?.hideSleepingArrangements ?? false,
  };
}

function proposalScheduledOverlapsRange(rangeStart: string, rangeEnd: string) {
  return and(
    isNotNull(proposals.scheduledStartAt),
    lte(proposals.scheduledStartAt, rangeEnd),
    or(isNull(proposals.scheduledEndAt), gte(proposals.scheduledEndAt, rangeStart)),
  );
}

function slotOverlapsRange(rangeStart: string, rangeEnd: string) {
  return and(
    lte(proposalTimeSlots.startAt, rangeEnd),
    or(isNull(proposalTimeSlots.endAt), gte(proposalTimeSlots.endAt, rangeStart)),
  );
}

async function acceptedSleepingPartnerIds(
  db: ReturnType<typeof getDb>,
  viewerId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({
      userLowId: sleepingPartnerships.userLowId,
      userHighId: sleepingPartnerships.userHighId,
      status: sleepingPartnerships.status,
    })
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.status, "accepted"),
        or(
          eq(sleepingPartnerships.userLowId, viewerId),
          eq(sleepingPartnerships.userHighId, viewerId),
        ),
      ),
    );

  const partnerIds = new Set<string>();
  for (const row of rows) {
    partnerIds.add(row.userLowId === viewerId ? row.userHighId : row.userLowId);
  }
  return partnerIds;
}

function markOverlaps(events: ScheduleEvent[]): ScheduleEvent[] {
  const flagged = events.map((event) => ({ ...event }));
  for (let i = 0; i < flagged.length; i += 1) {
    for (let j = i + 1; j < flagged.length; j += 1) {
      const a = flagged[i];
      const b = flagged[j];
      if (
        intervalsOverlap(a.startAt, a.endAt, b.startAt, b.endAt) &&
        a.participantIds.some((id) => b.participantIds.includes(id))
      ) {
        flagged[i].hasOverlap = true;
        flagged[j].hasOverlap = true;
      }
    }
  }
  return flagged;
}

/**
 * Loads calendar blocks for proposed, resolved, and archived proposals in a date range (PC-42).
 */
export async function listScheduleEventsAction(
  input: z.infer<typeof rangeSchema>,
): Promise<{ ok: boolean; message: string; payload: SchedulePayload }> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return {
      ok: false,
      message: sessionResult.message,
      payload: { events: [], planningItems: [] },
    };
  }

  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid range.",
      payload: { events: [], planningItems: [] },
    };
  }

  return withDb(async (db) => {
  const viewerId = sessionResult.user.id;
  const isAdmin = await userHasAdminAccess(sessionResult.user.role);
  const privacyFlags = await getSchedulePrivacyFlags(db);
  const partnerIds = await acceptedSleepingPartnerIds(db, viewerId);
  const { rangeStart, rangeEnd } = parsed.data;

  const overlappingSlotRows = await db
    .select({
      id: proposalTimeSlots.id,
      proposalId: proposalTimeSlots.proposalId,
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
      label: proposalTimeSlots.label,
      sortOrder: proposalTimeSlots.sortOrder,
      isDetached: proposalTimeSlots.isDetached,
    })
    .from(proposalTimeSlots)
    .where(slotOverlapsRange(rangeStart, rangeEnd))
    .orderBy(asc(proposalTimeSlots.sortOrder));

  const slotProposalIds = [...new Set(overlappingSlotRows.map((slot) => slot.proposalId))];

  const rangeFilters = [
    eq(proposals.state, "proposed"),
    eq(proposals.isBatchSleeping, true),
    eq(proposals.isRecurrenceParent, true),
    isNotNull(proposals.parentProposalId),
    proposalScheduledOverlapsRange(rangeStart, rangeEnd),
  ];
  if (slotProposalIds.length > 0) {
    rangeFilters.push(inArray(proposals.id, slotProposalIds));
  }

  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      proposerName: users.displayName,
      locationName: locations.name,
      locationText: proposals.locationText,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      intentionalSolo: proposals.intentionalSolo,
      atRisk: proposals.atRisk,
      isPoll: proposals.isPoll,
      isAllDay: proposals.isAllDay,
      eventPrivacy: proposals.eventPrivacy,
      isBatchSleeping: proposals.isBatchSleeping,
      parentProposalId: proposals.parentProposalId,
      isRecurrenceParent: proposals.isRecurrenceParent,
      eventIconKey: proposals.eventIconKey,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .where(
      and(
        inArray(proposals.state, ["proposed", "resolved", "archived"]),
        or(...rangeFilters),
      ),
    )
    .orderBy(asc(proposals.scheduledStartAt));

  const proposalIds = new Set(rows.map((row) => row.id));

  const inviteeRows = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
      displayName: users.displayName,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id))
    .where(proposalIds.size > 0 ? inArray(proposalInvitees.proposalId, [...proposalIds]) : eq(proposalInvitees.proposalId, ""));

  const inviteesByProposal = new Map<string, { userId: string; displayName: string }[]>();
  for (const row of inviteeRows) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push({ userId: row.userId, displayName: row.displayName });
    inviteesByProposal.set(row.proposalId, list);
  }

  const slotRows =
    proposalIds.size > 0
      ? await db
          .select({
            id: proposalTimeSlots.id,
            proposalId: proposalTimeSlots.proposalId,
            startAt: proposalTimeSlots.startAt,
            endAt: proposalTimeSlots.endAt,
            label: proposalTimeSlots.label,
            sortOrder: proposalTimeSlots.sortOrder,
            isDetached: proposalTimeSlots.isDetached,
          })
          .from(proposalTimeSlots)
          .where(inArray(proposalTimeSlots.proposalId, [...proposalIds]))
          .orderBy(asc(proposalTimeSlots.sortOrder))
      : [];

  const slotsByProposal = new Map<string, typeof slotRows>();
  for (const slot of slotRows) {
    const list = slotsByProposal.get(slot.proposalId) ?? [];
    list.push(slot);
    slotsByProposal.set(slot.proposalId, list);
  }

  const locationRows = await db.select({ id: locations.id, name: locations.name }).from(locations);
  const locationNameById = new Map(locationRows.map((row) => [row.id, row.name]));

  const events: ScheduleEvent[] = [];
  const planningItems: SchedulePlanningItem[] = [];

  for (const row of rows) {
    const invitees = inviteesByProposal.get(row.id) ?? [];
    const inviteeUserIds = invitees.map((invitee) => invitee.userId);
    const participantIds = [row.proposerId, ...inviteeUserIds];
    const participantNames = [
      row.proposerName,
      ...invitees.map((invitee) => invitee.displayName),
    ];

    if (row.state === "proposed" || row.state === "resolved" || row.state === "archived") {
      if (!viewerCanSeeProposal(viewerId, isAdmin, row.proposerId, inviteeUserIds, {
        state: row.state,
        eventPrivacy: row.eventPrivacy,
      })) {
        continue;
      }
    }

    const { privacyMasked, sleepingMasked, isContentMasked } = applyScheduleMasking({
      viewerId,
      isAdmin,
      proposerId: row.proposerId,
      inviteeUserIds,
      eventPrivacy: row.eventPrivacy,
      proposalState: row.state,
      proposalType: row.proposalType,
      privacyFlags,
      acceptedPartnerIds: partnerIds,
    });

    if (row.state === "proposed") {
      const proposedTitle =
        row.proposalType === "sleeping" && !privacyMasked && !sleepingMasked
          ? formatSleepingDisplayTitle({
              proposerName: row.proposerName,
              inviteeNames: invitees.map((invitee) => invitee.displayName),
              intentionalSolo: row.intentionalSolo,
              locationName: row.locationName ?? row.locationText ?? null,
              state: "proposed",
              atRisk: row.atRisk,
            })
          : row.title;
      planningItems.push({
        id: row.id,
        title: proposedTitle,
        state: row.state,
        proposalType: row.proposalType,
        scheduledStartAt: row.scheduledStartAt,
      });
    }

    if (row.state === "resolved") {
      const resolvedTitle =
        row.proposalType === "sleeping" && !privacyMasked && !sleepingMasked
          ? formatSleepingDisplayTitle({
              proposerName: row.proposerName,
              inviteeNames: invitees.map((invitee) => invitee.displayName),
              intentionalSolo: row.intentionalSolo,
              locationName: row.locationName ?? row.locationText ?? null,
              state: "resolved",
              atRisk: row.atRisk,
            })
          : row.title;
      planningItems.push({
        id: row.id,
        title: resolvedTitle,
        state: row.state,
        proposalType: row.proposalType,
        scheduledStartAt: row.scheduledStartAt,
      });
    }

    const windows: {
      startAt: string;
      endAt: string | null;
      slotLabel: string | null;
      key: string;
      slotId: string | null;
      sliceKind: ScheduleSliceKind;
      rootProposalId: string;
      sliceKey: string;
      occurrenceProposalId: string | null;
    }[] = [];

    const sliceContext = {
      id: row.id,
      isAllDay: row.isAllDay,
      isBatchSleeping: row.isBatchSleeping,
      parentProposalId: row.parentProposalId,
      isRecurrenceParent: row.isRecurrenceParent,
    };

    const slots = slotsByProposal.get(row.id) ?? [];
    let scheduled: { startAt: string; endAt: string | null } | null = null;
    let slotsForWindows = slots;

    if (row.state === "resolved" || row.state === "archived") {
      if (!(row.isBatchSleeping && slots.length > 0) && row.scheduledStartAt) {
        scheduled = { startAt: row.scheduledStartAt, endAt: row.scheduledEndAt };
      }
      if (!row.isBatchSleeping) {
        slotsForWindows = [];
      }
    } else if (row.state === "proposed") {
      if (slots.length === 0 && row.scheduledStartAt) {
        scheduled = { startAt: row.scheduledStartAt, endAt: row.scheduledEndAt };
      }
    }

    if (
      row.state === "resolved" ||
      row.state === "archived" ||
      row.state === "proposed"
    ) {
      for (const raw of buildScheduleWindows(sliceContext, slotsForWindows, scheduled)) {
        windows.push({
          startAt: raw.startAt,
          endAt: raw.endAt,
          slotLabel: raw.slotLabel,
          key: raw.key,
          slotId: raw.slotId,
          sliceKind: raw.slice.sliceKind,
          rootProposalId: raw.slice.rootProposalId,
          sliceKey: raw.slice.sliceKey,
          occurrenceProposalId: raw.slice.occurrenceProposalId,
        });
      }
    }

    for (const window of windows) {
      if (!eventInRange(window.startAt, window.endAt, rangeStart, rangeEnd)) continue;

      const maskedTitle = sleepingMasked
        ? HIDDEN_SLEEPING_TITLE
        : MASKED_TITLE;

      let windowParticipantIds = participantIds;
      let windowParticipantNames = participantNames;
      let windowLocationName = row.locationName ?? row.locationText ?? null;
      let windowIntentionalSolo = row.intentionalSolo;
      let windowTitle = row.title;

      if (row.proposalType === "sleeping" && !isContentMasked) {
        if (row.isBatchSleeping && window.slotLabel) {
          const meta = parseBatchSlotMeta(window.slotLabel);
          if (meta) {
            windowIntentionalSolo = meta.intentionalSolo ?? row.intentionalSolo;
            if (meta.intentionalSolo) {
              windowParticipantIds = [row.proposerId];
              windowParticipantNames = [row.proposerName];
            } else {
              windowParticipantIds = [row.proposerId, ...meta.inviteeUserIds];
              const names = [row.proposerName];
              for (const inviteeId of meta.inviteeUserIds) {
                const invitee = invitees.find((row) => row.userId === inviteeId);
                if (invitee) names.push(invitee.displayName);
              }
              windowParticipantNames = names;
            }
            if (meta.locationText?.trim()) {
              windowLocationName = meta.locationText.trim();
            } else if (meta.locationId) {
              windowLocationName = locationNameById.get(meta.locationId) ?? windowLocationName;
            }
          }
        }

        windowTitle = formatSleepingDisplayTitle({
          proposerName: row.proposerName,
          inviteeNames: windowIntentionalSolo
            ? []
            : windowParticipantNames.slice(1),
          intentionalSolo: windowIntentionalSolo,
          locationName: windowLocationName,
          state: row.state === "archived" ? "resolved" : (row.state as "proposed" | "resolved"),
          atRisk: row.atRisk,
        });
      }

      events.push({
        id: window.key,
        proposalId: row.id,
        title: isContentMasked ? maskedTitle : windowTitle,
        startAt: window.startAt,
        endAt: window.endAt,
        proposalType: row.proposalType,
        state: row.state as "proposed" | "resolved" | "archived",
        proposerId: row.proposerId,
        proposerName: row.proposerName,
        locationName: isContentMasked ? null : windowLocationName,
        participantIds: isContentMasked ? [] : windowParticipantIds,
        participantNames: isContentMasked ? [] : windowParticipantNames,
        intentionalSolo: windowIntentionalSolo,
        isContentMasked,
        isTentative: row.state === "proposed",
        atRisk: row.atRisk,
        hasOverlap: false,
        isPoll: row.isPoll,
        isAllDay: row.isAllDay,
        slotLabel: isContentMasked ? null : window.slotLabel,
        sliceKind: window.sliceKind,
        rootProposalId: window.rootProposalId,
        sliceKey: window.sliceKey,
        slotId: window.slotId,
        occurrenceProposalId: window.occurrenceProposalId,
        eventIconKey:
          isContentMasked || row.proposalType !== "event" ? null : row.eventIconKey ?? null,
      });
    }
  }

  const draftRows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      scheduledStartAt: proposals.scheduledStartAt,
    })
    .from(proposals)
    .where(and(eq(proposals.state, "draft"), eq(proposals.proposerId, viewerId)));

  for (const draft of draftRows) {
    planningItems.push({
      id: draft.id,
      title: draft.title,
      state: draft.state,
      proposalType: draft.proposalType,
      scheduledStartAt: draft.scheduledStartAt,
    });
  }

  return {
    ok: true,
    message: "Schedule loaded.",
    payload: {
      events: markOverlaps(events),
      planningItems,
    },
  };
  });
}
