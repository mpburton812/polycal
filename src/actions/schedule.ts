"use server";

import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
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

const MASKED_TITLE = "Private event";
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
  state: "proposed" | "resolved";
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
  slotLabel: string | null;
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

async function getPrivacyAdminFlags(
  db: ReturnType<typeof getDb>,
): Promise<{ adminCanSeePrivate: boolean; adminCanSeeSuperPrivate: boolean; hideSleeping: boolean }> {
  const [group] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  return {
    adminCanSeePrivate: group?.adminCanSeePrivate ?? false,
    adminCanSeeSuperPrivate: group?.adminCanSeeSuperPrivate ?? false,
    hideSleeping: group?.hideSleepingArrangements ?? false,
  };
}

function shouldMaskProposalContent(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  eventPrivacy: EventPrivacyLevel,
  adminCanSeePrivate: boolean,
  adminCanSeeSuperPrivate: boolean,
): boolean {
  if (eventPrivacy === "open") return false;
  if (proposerId === viewerId || inviteeUserIds.includes(viewerId)) return false;
  if (eventPrivacy === "private" && isAdmin && adminCanSeePrivate) return false;
  if (eventPrivacy === "super_private" && isAdmin && adminCanSeeSuperPrivate) return false;
  return true;
}

function shouldMaskSleepingForViewer(
  viewerId: string,
  proposerId: string,
  inviteeUserIds: string[],
  hideSleeping: boolean,
  acceptedPartnerIds: Set<string>,
): boolean {
  if (!hideSleeping) return false;
  if (proposerId === viewerId || inviteeUserIds.includes(viewerId)) return false;
  const participants = new Set([proposerId, ...inviteeUserIds]);
  for (const participantId of participants) {
    if (participantId !== viewerId && acceptedPartnerIds.has(participantId)) {
      return false;
    }
  }
  return true;
}

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
 * Loads calendar blocks for proposed and resolved proposals in a date range (PC-42).
 */
export async function listScheduleEventsAction(
  input: z.infer<typeof rangeSchema>,
): Promise<{ ok: boolean; message: string; payload: SchedulePayload }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required.", payload: { events: [], planningItems: [] } };
  }

  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid range.",
      payload: { events: [], planningItems: [] },
    };
  }

  await ensureDbReady();
  const db = getDb();
  const viewerId = session.user.id;
  const isAdmin = await userHasAdminAccess(session.user.role);
  const privacyFlags = await getPrivacyAdminFlags(db);
  const partnerIds = await acceptedSleepingPartnerIds(db, viewerId);
  const { rangeStart, rangeEnd } = parsed.data;

  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      proposerName: users.displayName,
      locationName: locations.name,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      intentionalSolo: proposals.intentionalSolo,
      atRisk: proposals.atRisk,
      isPoll: proposals.isPoll,
      eventPrivacy: proposals.eventPrivacy,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .where(inArray(proposals.state, ["proposed", "resolved"]))
    .orderBy(asc(proposals.scheduledStartAt));

  const inviteeRows = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
      displayName: users.displayName,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id));

  const inviteesByProposal = new Map<string, { userId: string; displayName: string }[]>();
  for (const row of inviteeRows) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push({ userId: row.userId, displayName: row.displayName });
    inviteesByProposal.set(row.proposalId, list);
  }

  const slotRows = await db
    .select({
      id: proposalTimeSlots.id,
      proposalId: proposalTimeSlots.proposalId,
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
      label: proposalTimeSlots.label,
      sortOrder: proposalTimeSlots.sortOrder,
    })
    .from(proposalTimeSlots)
    .orderBy(asc(proposalTimeSlots.sortOrder));

  const slotsByProposal = new Map<string, typeof slotRows>();
  for (const slot of slotRows) {
    const list = slotsByProposal.get(slot.proposalId) ?? [];
    list.push(slot);
    slotsByProposal.set(slot.proposalId, list);
  }

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

    if (row.state === "proposed") {
      if (!viewerCanSeeProposal(viewerId, isAdmin, row.proposerId, inviteeUserIds)) {
        continue;
      }
      planningItems.push({
        id: row.id,
        title: row.title,
        state: row.state,
        proposalType: row.proposalType,
        scheduledStartAt: row.scheduledStartAt,
      });
    }

    if (row.state === "resolved") {
      planningItems.push({
        id: row.id,
        title: row.title,
        state: row.state,
        proposalType: row.proposalType,
        scheduledStartAt: row.scheduledStartAt,
      });
    }

    const privacyMasked = shouldMaskProposalContent(
      viewerId,
      isAdmin,
      row.proposerId,
      inviteeUserIds,
      row.eventPrivacy,
      privacyFlags.adminCanSeePrivate,
      privacyFlags.adminCanSeeSuperPrivate,
    );
    const sleepingMasked =
      row.proposalType === "sleeping" &&
      shouldMaskSleepingForViewer(
        viewerId,
        row.proposerId,
        inviteeUserIds,
        privacyFlags.hideSleeping,
        partnerIds,
      );
    const isContentMasked = privacyMasked || sleepingMasked;

    const windows: { startAt: string; endAt: string | null; slotLabel: string | null; key: string }[] =
      [];

    if (row.state === "resolved" && row.scheduledStartAt) {
      windows.push({
        startAt: row.scheduledStartAt,
        endAt: row.scheduledEndAt,
        slotLabel: null,
        key: row.id,
      });
    } else if (row.state === "proposed") {
      const slots = slotsByProposal.get(row.id) ?? [];
      if (slots.length > 0) {
        for (const slot of slots) {
          windows.push({
            startAt: slot.startAt,
            endAt: slot.endAt,
            slotLabel: slot.label,
            key: `${row.id}:${slot.id}`,
          });
        }
      } else if (row.scheduledStartAt) {
        windows.push({
          startAt: row.scheduledStartAt,
          endAt: row.scheduledEndAt,
          slotLabel: null,
          key: row.id,
        });
      }
    }

    for (const window of windows) {
      if (!eventInRange(window.startAt, window.endAt, rangeStart, rangeEnd)) continue;

      const maskedTitle = sleepingMasked
        ? HIDDEN_SLEEPING_TITLE
        : MASKED_TITLE;

      events.push({
        id: window.key,
        proposalId: row.id,
        title: isContentMasked ? maskedTitle : row.title,
        startAt: isContentMasked ? window.startAt : window.startAt,
        endAt: isContentMasked ? window.endAt : window.endAt,
        proposalType: row.proposalType,
        state: row.state as "proposed" | "resolved",
        proposerId: row.proposerId,
        proposerName: row.proposerName,
        locationName: isContentMasked ? null : row.locationName,
        participantIds,
        participantNames: isContentMasked ? [] : participantNames,
        intentionalSolo: row.intentionalSolo,
        isContentMasked,
        isTentative: row.state === "proposed",
        atRisk: row.atRisk,
        hasOverlap: false,
        isPoll: row.isPoll,
        slotLabel: isContentMasked ? null : window.slotLabel,
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
}
