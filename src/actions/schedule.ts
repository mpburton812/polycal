"use server";

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { userHasAdminAccess } from "@/lib/admin-access";
import { requireNetworkSession } from "@/lib/networks/context";
import { withDb } from "@/lib/actions/context";
import { getDb } from "@/lib/db/client";
import {
  locations,
  proposalInvitees,
  proposalTimeSlots,
  proposals,
  users,
  type ProposalType,
} from "@/lib/db/schema";
import { eventInRange } from "@/lib/schedule/dates";
import { markOverlaps } from "@/lib/schedule/overlaps";
import { buildScheduleWindows } from "@/lib/schedule/schedule-slices";
import { resolveTimezone } from "@/lib/schedule/timezone";
import type { ScheduleSliceKind } from "@/lib/schedule/slice-types";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { parseBatchSlotMeta } from "@/lib/proposals/batch-sleeping";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";
import {
  getAdminCanSeeUninvolved,
  MASKED_TITLE,
  canViewProposalContent,
} from "@/lib/proposals/access";
import { getAcceptedSleepingPartnerIds } from "@/lib/proposals/partners";

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
  /**
   * True when this sleeping block is visible only because an accepted partner
   * is involved and the viewer is not (PC-366).
   */
  isPartnerOnlySleeping: boolean;
}

export interface SchedulePayload {
  events: ScheduleEvent[];
}

async function getSchedulePrivacyFlags(
  db: ReturnType<typeof getDb>,
  networkId: string,
): Promise<{
  hideSleeping: boolean;
  adminCanSeeUninvolved: boolean;
  seePartnersSleepingArrangements: boolean;
}> {
  const adminCanSeeUninvolved = await getAdminCanSeeUninvolved(db, networkId);
  const settings = await loadNetworkSettings(networkId, db);
  return {
    hideSleeping: settings?.hideSleepingArrangements ?? false,
    adminCanSeeUninvolved,
    seePartnersSleepingArrangements: settings?.seePartnersSleepingArrangements ?? false,
  };
}

/**
 * Padding for the SQL range prefilters (PC-355).
 *
 * `buildScheduleWindows` can shift a window by up to one civil day (all-day
 * noon-UTC normalisation, sleeping day bounds) plus the viewer's UTC offset, so
 * rows are fetched with two days of slack and the exact `eventInRange` check
 * still decides what renders.
 */
const SCHEDULE_RANGE_PAD_MS = 2 * 24 * 60 * 60 * 1000;

function shiftIso(iso: string, deltaMs: number): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms + deltaMs).toISOString();
}

function proposalScheduledOverlapsRange(rangeStart: string, rangeEnd: string) {
  return and(
    isNotNull(proposals.scheduledStartAt),
    lte(proposals.scheduledStartAt, rangeEnd),
    or(
      gte(proposals.scheduledEndAt, rangeStart),
      // Open-ended rows (single sleeping nights) occupy their start day only —
      // an ancient night must not be dragged into every future range.
      and(isNull(proposals.scheduledEndAt), gte(proposals.scheduledStartAt, rangeStart)),
    ),
  );
}

function slotOverlapsRange(rangeStart: string, rangeEnd: string) {
  return and(
    lte(proposalTimeSlots.startAt, rangeEnd),
    or(
      gte(proposalTimeSlots.endAt, rangeStart),
      // A slot with no end occupies its start instant/day only.
      and(isNull(proposalTimeSlots.endAt), gte(proposalTimeSlots.startAt, rangeStart)),
    ),
  );
}

/**
 * Loads calendar blocks for proposed, resolved, and archived proposals in a date range (PC-42).
 */
export async function listScheduleEventsAction(
  input: z.infer<typeof rangeSchema>,
): Promise<{ ok: boolean; message: string; payload: SchedulePayload }> {
  const sessionResult = await requireNetworkSession();
  if (!sessionResult.ok) {
    return {
      ok: false,
      message: sessionResult.message,
      payload: { events: [] },
    };
  }

  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid range.",
      payload: { events: [] },
    };
  }

  return withDb(async (db) => {
  const viewerId = sessionResult.user.id;
  const networkId = sessionResult.user.activeNetworkId;
  const isAdmin =
    sessionResult.user.activeNetworkRole === "network_admin" ||
    sessionResult.user.isPlatformAdmin ||
    (await userHasAdminAccess(sessionResult.user.role));
  const [viewerRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, viewerId))
    .limit(1);
  const viewerTimeZone = resolveTimezone(viewerRow?.timezone);
  const privacyFlags = await getSchedulePrivacyFlags(db, networkId);
  const partnerIds = await getAcceptedSleepingPartnerIds(db, viewerId, networkId);
  const { rangeStart, rangeEnd } = parsed.data;

  // Every rendered window derives from a time slot or the proposal's own
  // scheduled bounds, so a padded range prefilter on those two sources replaces
  // the old fully-global proposed / batch / recurrence branches (PC-355).
  const paddedStart = shiftIso(rangeStart, -SCHEDULE_RANGE_PAD_MS);
  const paddedEnd = shiftIso(rangeEnd, SCHEDULE_RANGE_PAD_MS);

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
    .where(slotOverlapsRange(paddedStart, paddedEnd))
    .orderBy(asc(proposalTimeSlots.sortOrder));

  const slotProposalIds = [...new Set(overlappingSlotRows.map((slot) => slot.proposalId))];

  const rangeFilters = [proposalScheduledOverlapsRange(paddedStart, paddedEnd)];
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
        eq(proposals.networkId, networkId),
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

  const locationRows = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.networkId, networkId));
  const locationNameById = new Map(locationRows.map((row) => [row.id, row.name]));

  const events: ScheduleEvent[] = [];

  for (const row of rows) {
    const invitees = inviteesByProposal.get(row.id) ?? [];
    const inviteeUserIds = invitees.map((invitee) => invitee.userId);
    const participantIds = [row.proposerId, ...inviteeUserIds];
    const participantNames = [
      row.proposerName,
      ...invitees.map((invitee) => invitee.displayName),
    ];

    const { visible, contentMasked: isContentMasked, isPartnerOnlySleeping } =
      canViewProposalContent({
      viewerId,
      isAdmin,
      proposerId: row.proposerId,
      inviteeUserIds,
      proposalType: row.proposalType,
      state: row.state,
      adminCanSeeUninvolved: privacyFlags.adminCanSeeUninvolved,
      applyScheduleMask: true,
      hideSleeping: privacyFlags.hideSleeping,
      seePartnersSleepingArrangements: privacyFlags.seePartnersSleepingArrangements,
      acceptedPartnerIds: partnerIds,
    });

    if (
      (row.state === "proposed" || row.state === "resolved" || row.state === "archived") &&
      !visible
    ) {
      continue;
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

    if (row.state === "archived") {
      // Cancelled items clear scheduled*; never rebuild from leftover slots
      // (batch sleeping used to keep occupying nights after cancel — PC-373).
      slotsForWindows = [];
      if (row.scheduledStartAt) {
        scheduled = { startAt: row.scheduledStartAt, endAt: row.scheduledEndAt };
      }
    } else if (row.state === "resolved") {
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
      for (const raw of buildScheduleWindows(sliceContext, slotsForWindows, scheduled, viewerTimeZone)) {
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

      // Only sleeping-network masking remains (privacy levels removed PC-280).
      const maskedTitle = MASKED_TITLE;

      let windowParticipantIds = participantIds;
      let windowParticipantNames = participantNames;
      let windowLocationName = row.locationName ?? row.locationText ?? null;
      let windowIntentionalSolo = row.intentionalSolo;
      let windowTitle = row.title;

      if (isSleepingLikeType(row.proposalType) && !isContentMasked) {
        if (row.isBatchSleeping && window.slotLabel) {
          const meta = parseBatchSlotMeta(window.slotLabel);
          if (meta) {
            windowIntentionalSolo = meta.intentionalSolo ?? row.intentionalSolo;
            const subjectId = meta.subjectUserId ?? row.proposerId;
            const subjectName =
              invitees.find((person) => person.userId === subjectId)?.displayName ??
              (subjectId === row.proposerId ? row.proposerName : subjectId);
            if (meta.intentionalSolo) {
              windowParticipantIds = [subjectId];
              windowParticipantNames = [subjectName];
            } else {
              windowParticipantIds = [subjectId, ...meta.inviteeUserIds];
              const names = [subjectName];
              for (const inviteeId of meta.inviteeUserIds) {
                const invitee = invitees.find((person) => person.userId === inviteeId);
                if (invitee) names.push(invitee.displayName);
              }
              windowParticipantNames = names;
            }
            if (meta.locationText?.trim()) {
              windowLocationName = meta.locationText.trim();
            } else if (meta.locationId) {
              windowLocationName = locationNameById.get(meta.locationId) ?? windowLocationName;
            }
            windowTitle = formatSleepingDisplayTitle({
              proposerName: subjectName,
              inviteeNames: windowIntentionalSolo ? [] : windowParticipantNames.slice(1),
              intentionalSolo: windowIntentionalSolo,
              locationName: windowLocationName,
              state: row.state === "archived" ? "resolved" : (row.state as "proposed" | "resolved"),
              atRisk: row.atRisk,
            });
          } else {
            windowTitle = formatSleepingDisplayTitle({
              proposerName: row.proposerName,
              inviteeNames: windowIntentionalSolo ? [] : windowParticipantNames.slice(1),
              intentionalSolo: windowIntentionalSolo,
              locationName: windowLocationName,
              state: row.state === "archived" ? "resolved" : (row.state as "proposed" | "resolved"),
              atRisk: row.atRisk,
            });
          }
        } else {
          windowTitle = formatSleepingDisplayTitle({
            proposerName: row.proposerName,
            inviteeNames: windowIntentionalSolo ? [] : windowParticipantNames.slice(1),
            intentionalSolo: windowIntentionalSolo,
            locationName: windowLocationName,
            state: row.state === "archived" ? "resolved" : (row.state as "proposed" | "resolved"),
            atRisk: row.atRisk,
          });
        }
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
        isPartnerOnlySleeping,
      });
    }
  }

  return {
    ok: true,
    message: "Schedule loaded.",
    payload: {
      events: markOverlaps(events),
    },
  };
  });
}
