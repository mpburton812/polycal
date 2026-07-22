"use server";

import { and, asc, eq, inArray, ne, or } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locations,
  proposalInvitees,
  proposalTimeSlots,
  proposals,
  sleepingPartnerships,
  users,
} from "@/lib/db/schema";
import { PARTNERSHIP_CARD_PREFIX } from "@/lib/proposals/constants";
import { optionalInviteeVotesPending } from "@/lib/proposals/poll-utils";
import {
  computeProposedExpiresAt,
  computeScheduleExpirationInstant,
  loadEnforcementSettings,
} from "@/lib/proposals/enforcement";
import {
  getProposalSpecialKind,
  proposalDescriptionForDisplay,
} from "@/lib/proposals/special-proposals";
import {
  getAdminCanSeeUninvolved,
  viewerCanSeeProposalWithSleepingGate,
} from "@/lib/proposals/access";
import { buildPartnershipProposalCopy } from "@/lib/partnerships/copy";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import { sleepingCalendarDayEnd } from "@/lib/proposals/sleeping-schedule";
import { proposalHasSchedulableWindows } from "@/lib/schedule/schedule-slices";

import type { ProposalBoard, ProposalCard } from "./types";

/** Parses bedroom label JSON stored on locations for card display (PC-124). */
function bedroomLabelFromPlace(
  bedroomIndex: number | null,
  bedroomNamesJson: string | null,
  bedroomCount: number | null,
): string | null {
  if (bedroomIndex === null || bedroomIndex < 0) return null;
  let names: string[] = [];
  if (bedroomNamesJson) {
    try {
      const parsed = JSON.parse(bedroomNamesJson) as unknown;
      if (Array.isArray(parsed)) {
        names = parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      names = [];
    }
  }
  const count = bedroomCount ?? 0;
  if (names.length === 0 && count > 0) {
    names = Array.from({ length: count }, (_, index) => `Bedroom ${index + 1}`);
  }
  return names[bedroomIndex] ?? `Bedroom ${bedroomIndex + 1}`;
}

/**
 * Lists Kanban columns scoped to the signed-in user (PC-40 / PC-66).
 */
export async function listProposalBoardAction(): Promise<ProposalBoard> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) {
    return { draft: [], proposed: [], resolved: [], archived: [] };
  }

  const db = getDb();
  const { bridgeLegacyResidencyProposals } = await import("@/actions/residency-proposals");
  await bridgeLegacyResidencyProposals(db);
  const viewerId = session.user.id;
  const isAdmin = await userHasAdminAccess(session.user.role);
  const adminCanSeeUninvolved = await getAdminCanSeeUninvolved(db);
  const adminSeesAll = isAdmin && adminCanSeeUninvolved;
  const nowIso = new Date().toISOString();
  const enforcement = await loadEnforcementSettings(db);

  const viewerInviteeProposalRows = adminSeesAll
    ? []
    : await db
        .select({ proposalId: proposalInvitees.proposalId })
        .from(proposalInvitees)
        .where(eq(proposalInvitees.userId, viewerId));
  const viewerInviteeProposalIds = viewerInviteeProposalRows.map((row) => row.proposalId);

  const boardVisibilityFilter = adminSeesAll
    ? undefined
    : or(
        and(eq(proposals.state, "draft"), eq(proposals.proposerId, viewerId)),
        and(
          ne(proposals.state, "draft"),
          or(
            eq(proposals.proposerId, viewerId),
            viewerInviteeProposalIds.length > 0
              ? inArray(proposals.id, viewerInviteeProposalIds)
              : eq(proposals.id, "__none__"),
            inArray(proposals.state, ["resolved", "archived"]),
          ),
        ),
      );

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
      locationText: proposals.locationText,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      atRisk: proposals.atRisk,
      atRiskExpiresAt: proposals.atRiskExpiresAt,
      lastNudgeAt: proposals.lastNudgeAt,
      updatedAt: proposals.updatedAt,
      isPoll: proposals.isPoll,
      isAllDay: proposals.isAllDay,
      intentionalSolo: proposals.intentionalSolo,
      isBatchSleeping: proposals.isBatchSleeping,
      isRecurrenceParent: proposals.isRecurrenceParent,
      parentProposalId: proposals.parentProposalId,
      eventIconKey: proposals.eventIconKey,
      bedroomIndex: proposals.bedroomIndex,
      locationBedroomNames: locations.bedroomNames,
      locationBedroomCount: locations.bedroomCount,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .where(boardVisibilityFilter)
    .orderBy(asc(proposals.updatedAt));

  const visibleProposalIds = rows.map((row) => row.id);
  const inviteeRows =
    visibleProposalIds.length > 0
      ? await db
          .select({
            proposalId: proposalInvitees.proposalId,
            userId: proposalInvitees.userId,
            displayName: users.displayName,
            role: proposalInvitees.role,
            voteStatus: proposalInvitees.voteStatus,
          })
          .from(proposalInvitees)
          .innerJoin(users, eq(proposalInvitees.userId, users.id))
          .where(inArray(proposalInvitees.proposalId, visibleProposalIds))
      : [];

  const inviteesByProposal = new Map<string, typeof inviteeRows>();
  for (const row of inviteeRows) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push(row);
    inviteesByProposal.set(row.proposalId, list);
  }

  const slotDetailRows =
    visibleProposalIds.length > 0
      ? await db
          .select({
            id: proposalTimeSlots.id,
            proposalId: proposalTimeSlots.proposalId,
            startAt: proposalTimeSlots.startAt,
            endAt: proposalTimeSlots.endAt,
            label: proposalTimeSlots.label,
            isDetached: proposalTimeSlots.isDetached,
          })
          .from(proposalTimeSlots)
          .where(inArray(proposalTimeSlots.proposalId, visibleProposalIds))
      : [];

  const slotsByProposal = new Map<string, typeof slotDetailRows>();
  for (const slot of slotDetailRows) {
    const list = slotsByProposal.get(slot.proposalId) ?? [];
    list.push(slot);
    slotsByProposal.set(slot.proposalId, list);
  }

  const empty: ProposalBoard = { draft: [], proposed: [], resolved: [], archived: [] };

  for (const row of rows) {
    const invitees = inviteesByProposal.get(row.id) ?? [];
    const inviteeUserIds = invitees.map((invitee) => invitee.userId);

    if (
      row.state === "proposed" ||
      row.state === "resolved" ||
      row.state === "archived"
    ) {
      if (
        !viewerCanSeeProposalWithSleepingGate(viewerId, isAdmin, row.proposerId, inviteeUserIds, {
          proposalType: row.proposalType,
          state: row.state,
          adminCanSeeUninvolved,
        })
      ) {
        continue;
      }
    }

    // Board never applies schedule sleeping mask (PC-306) — isContentMasked stays false.
    const display = row;

    const viewerInvitee = invitees.find((invitee) => invitee.userId === viewerId);
    const optionalRsvpPending = optionalInviteeVotesPending(row, viewerInvitee);
    const respondedCount = invitees.filter((inv) => inv.voteStatus !== "not_seen").length;
    const needsViewerAction =
      viewerInvitee !== undefined &&
      viewerInvitee.voteStatus === "not_seen" &&
      (row.state === "proposed" ||
        (row.state === "resolved" && row.atRisk && viewerInvitee.role === "required") ||
        (row.state === "resolved" && !row.atRisk && viewerInvitee.role === "required") ||
        optionalRsvpPending);

    const pendingVoteCount = invitees.filter((inv) => inv.voteStatus === "not_seen").length;
    const hasPendingOptional =
      row.state === "resolved" &&
      invitees.some((inv) => inv.role === "optional" && inv.voteStatus === "not_seen");
    const nudgeEligibleState = row.state === "proposed" || hasPendingOptional;
    const canNudge =
      nudgeEligibleState &&
      pendingVoteCount > 0 &&
      (isAdmin || row.proposerId === viewerId) &&
      getProposalSpecialKind(row.description) !== "residency";

    const slotStarts = (slotsByProposal.get(row.id) ?? [])
      .filter((slot) => !slot.isDetached)
      .map((slot) => slot.startAt)
      .sort();
    const scheduleInstant =
      row.state === "proposed"
        ? computeScheduleExpirationInstant(row, slotStarts)
        : null;
    const proposedExpiresAt =
      row.state === "proposed"
        ? computeProposedExpiresAt(
            scheduleInstant,
            row.updatedAt,
            enforcement.proposedMaxDays,
          )
        : null;

    const scheduleEnd = display.scheduledEndAt ?? display.scheduledStartAt;
    // Sleeping nights are calendar-date-only — compare against end of the calendar
    // day rather than the raw (often midnight) timestamp (PC-280).
    const isPastSchedule = Boolean(
      scheduleEnd &&
        (row.proposalType === "sleeping"
          ? sleepingCalendarDayEnd(scheduleEnd).toISOString()
          : scheduleEnd) < nowIso,
    );

    let cardTitle = display.title;
    if (row.proposalType === "sleeping") {
      cardTitle = formatSleepingDisplayTitle({
        proposerName: row.proposerName,
        inviteeNames: invitees.map((invitee) => invitee.displayName),
        intentionalSolo: row.intentionalSolo,
        locationName: display.locationName ?? display.locationText ?? null,
        state: row.state,
        atRisk: row.atRisk,
      });
    }

    const card: ProposalCard = {
      id: row.id,
      title: cardTitle,
      description: proposalDescriptionForDisplay(row.description),
      proposalType: row.proposalType,
      state: optionalRsvpPending ? "proposed" : row.state,
      proposerId: row.proposerId,
      proposerName: row.proposerName,
      locationName: display.locationName ?? display.locationText ?? null,
      scheduledStartAt: display.scheduledStartAt ?? null,
      scheduledEndAt: display.scheduledEndAt ?? null,
      atRisk: row.atRisk,
      isPoll: row.isPoll,
      isAllDay: row.isAllDay,
      isContentMasked: false,
      needsViewerAction,
      inviteeCount: invitees.length,
      respondedCount,
      pendingVoteCount,
      proposedExpiresAt,
      atRiskExpiresAt: row.atRisk ? row.atRiskExpiresAt : null,
      canNudge,
      lastNudgeAt: row.lastNudgeAt ?? null,
      canAdminDeleteProposal: isAdmin,
      isPastSchedule,
      isBatchSleeping: row.isBatchSleeping,
      isRecurring: Boolean(row.isRecurrenceParent || row.parentProposalId),
      bedroomLabel:
        row.proposalType !== "sleeping"
          ? null
          : bedroomLabelFromPlace(
              row.bedroomIndex,
              row.locationBedroomNames,
              row.locationBedroomCount,
            ),
      eventIconKey:
        row.proposalType !== "event" ? null : row.eventIconKey ?? null,
      viewerIsInvitee: viewerInvitee !== undefined,
      notOnCalendar:
        row.state === "resolved" &&
        !proposalHasSchedulableWindows(
          {
            id: row.id,
            isAllDay: row.isAllDay,
            isBatchSleeping: row.isBatchSleeping,
            parentProposalId: row.parentProposalId,
            isRecurrenceParent: row.isRecurrenceParent,
            state: row.state,
            scheduledStartAt: row.scheduledStartAt,
            scheduledEndAt: row.scheduledEndAt,
          },
          slotsByProposal.get(row.id) ?? [],
        ),
      specialKind: getProposalSpecialKind(row.description) ?? undefined,
    };

    const column: keyof ProposalBoard = optionalRsvpPending
      ? "proposed"
      : (row.state as keyof ProposalBoard);
    empty[column].push(card);
  }

  const partnershipRows = await db
    .select({
      id: sleepingPartnerships.id,
      userLowId: sleepingPartnerships.userLowId,
      userHighId: sleepingPartnerships.userHighId,
      proposedById: sleepingPartnerships.proposedById,
      initiatedByUserId: sleepingPartnerships.initiatedByUserId,
      proposerName: users.displayName,
    })
    .from(sleepingPartnerships)
    .innerJoin(users, eq(sleepingPartnerships.proposedById, users.id))
    .where(eq(sleepingPartnerships.status, "proposed"));

  if (partnershipRows.length > 0) {
    const partnerIds = new Set<string>();
    for (const row of partnershipRows) {
      partnerIds.add(row.userLowId);
      partnerIds.add(row.userHighId);
      if (row.initiatedByUserId) partnerIds.add(row.initiatedByUserId);
    }
    const partnerRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [...partnerIds]));
    const partnerMap = new Map(partnerRows.map((row) => [row.id, row.displayName]));

    for (const row of partnershipRows) {
      const isParticipant =
        row.userLowId === viewerId || row.userHighId === viewerId;
      if (!isParticipant && !adminSeesAll) continue;

      const partnerId =
        row.userLowId === viewerId ? row.userHighId : row.userLowId;
      const partnerName = partnerMap.get(partnerId) ?? "Partner";
      const lowName = partnerMap.get(row.userLowId) ?? "Member";
      const highName = partnerMap.get(row.userHighId) ?? "Member";
      const initiatedByName = row.initiatedByUserId
        ? (partnerMap.get(row.initiatedByUserId) ?? null)
        : null;
      const copy = buildPartnershipProposalCopy({
        viewerId,
        userLowId: row.userLowId,
        userHighId: row.userHighId,
        proposedById: row.proposedById,
        proposerName: row.proposerName,
        initiatedByName,
        partnerName,
        lowName,
        highName,
      });

      empty.proposed.push({
        id: `${PARTNERSHIP_CARD_PREFIX}${row.id}`,
        title: `Sleeping partnership with ${partnerName}`,
        description: copy.description,
        proposalType: "event",
        state: "proposed",
        proposerId: row.proposedById,
        proposerName: copy.proposerDisplayName,
        locationName: null,
        scheduledStartAt: null,
        scheduledEndAt: null,
        atRisk: false,
        isPoll: false,
        isAllDay: false,
        isContentMasked: false,
        needsViewerAction: copy.needsViewerAction,
        inviteeCount: 1,
        respondedCount: copy.needsViewerAction ? 0 : 0,
        isPastSchedule: false,
        cardKind: "partnership",
        partnershipId: row.id,
        partnerName,
        viewerIsInvitee: isParticipant && row.proposedById !== viewerId,
      });
    }
  }

  return empty;
}
