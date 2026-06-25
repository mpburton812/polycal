import { getDb } from "@/lib/db/client";
import {
  proposals,
  proposalInvitees,
  proposalTimeSlots,
  locations,
  users,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import { isNonProductionEnvironment } from "@/lib/env";
import { usesTestFamilySeed } from "@/lib/seed/seed-profile";
import { randomUUID } from "node:crypto";

interface DemoTimeSlot {
  startOffsetDays: number;
  startHour: number;
  durationHours: number;
  label?: string;
}

interface DemoProposal {
  id: string;
  title: string;
  description: string;
  proposalType: ProposalType;
  state: ProposalState;
  proposerId: string;
  locationId?: string;
  notes?: string;
  inviteeIds?: string[];
  /** Resolved events — schedule relative to seed time (PC-42). */
  scheduledOffsetDays?: number;
  scheduledStartHour?: number;
  scheduledDurationHours?: number;
  /** Proposed events without resolve — time slot windows for calendar (PC-42). */
  timeSlots?: DemoTimeSlot[];
}

/** Builds ISO timestamps anchored to the current week for schedule demos. */
function scheduleWindow(
  offsetDays: number,
  startHour: number,
  durationHours: number,
): { startAt: string; endAt: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(start);
  end.setTime(end.getTime() + durationHours * 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

/** Representative fixtures across all Kanban columns for QA and demos. */
const DEMO_PROPOSALS: DemoProposal[] = [
  {
    id: "prop-draft-1",
    title: "Jedi Council briefing",
    description: "Draft event — not yet submitted.",
    proposalType: "event",
    state: "draft",
    proposerId: "sw-luke",
    locationId: "loc-falcon",
  },
  {
    id: "prop-draft-2",
    title: "Dagobah training weekend",
    description: "Sleeping batch draft for review.",
    proposalType: "sleeping",
    state: "draft",
    proposerId: "sw-leia",
    locationId: "loc-dagobah",
    notes: "IntentionalSolo candidate",
  },
  {
    id: "prop-proposed-1",
    title: "Rescue Han from carbonite",
    description: "Awaiting votes from required invitees.",
    proposalType: "event",
    state: "proposed",
    proposerId: "sw-leia",
    locationId: "loc-cloudcity",
    inviteeIds: ["sw-luke", "sw-han"],
    timeSlots: [{ startOffsetDays: 1, startHour: 14, durationHours: 2 }],
  },
  {
    id: "prop-proposed-2",
    title: "Falcon overnight — Tatooine",
    description: "Sleeping proposal awaiting votes.",
    proposalType: "sleeping",
    state: "proposed",
    proposerId: "sw-han",
    locationId: "loc-tatooine",
    inviteeIds: ["sw-leia"],
    timeSlots: [{ startOffsetDays: 3, startHour: 22, durationHours: 8 }],
  },
  {
    id: "prop-proposed-3",
    title: "Death Star planning session",
    description: "Optional voters may abstain.",
    proposalType: "event",
    state: "proposed",
    proposerId: "sw-vader",
    locationId: "loc-deathstar",
    inviteeIds: ["sw-luke"],
    timeSlots: [{ startOffsetDays: 5, startHour: 10, durationHours: 1 }],
  },
  {
    id: "prop-resolved-1",
    title: "Yavin 4 victory celebration",
    description: "Approved and on the calendar.",
    proposalType: "event",
    state: "resolved",
    proposerId: "sw-luke",
    locationId: "loc-falcon",
    scheduledOffsetDays: 2,
    scheduledStartHour: 18,
    scheduledDurationHours: 3,
    inviteeIds: ["sw-leia", "sw-han"],
  },
  {
    id: "prop-resolved-2",
    title: "Cloud City hospitality suite",
    description: "Resolved sleeping arrangement.",
    proposalType: "sleeping",
    state: "resolved",
    proposerId: "sw-lando",
    locationId: "loc-cloudcity",
    scheduledOffsetDays: 4,
    scheduledStartHour: 22,
    scheduledDurationHours: 8,
    inviteeIds: ["sw-han"],
  },
  {
    id: "prop-archived-1",
    title: "Cancelled Endor camping trip",
    description: "Declined and archived for history.",
    proposalType: "sleeping",
    state: "archived",
    proposerId: "sw-padme",
    locationId: "loc-dagobah",
    notes: "Archived after required decline",
  },
];

/**
 * Seeds demo proposals when the table is empty (non-production only).
 */
export async function seedDemoProposals(options?: {
  force?: boolean;
}): Promise<{ seeded: boolean; count: number }> {
  if (!isNonProductionEnvironment()) {
    return { seeded: false, count: 0 };
  }
  if (usesTestFamilySeed()) {
    return { seeded: false, count: 0 };
  }

  const db = getDb();
  if (!options?.force) {
    const existing = await db.select({ id: proposals.id }).from(proposals).limit(1);
    if (existing.length > 0) {
      return { seeded: false, count: 0 };
    }
  }

  const userIds = new Set(
    (await db.select({ id: users.id }).from(users)).map((row) => row.id),
  );
  const locationIds = new Set(
    (await db.select({ id: locations.id }).from(locations)).map((row) => row.id),
  );

  const eligible = DEMO_PROPOSALS.filter(
    (proposal) =>
      userIds.has(proposal.proposerId) &&
      (!proposal.locationId || locationIds.has(proposal.locationId)),
  );

  if (eligible.length === 0) {
    return { seeded: false, count: 0 };
  }

  const now = new Date().toISOString();
  for (const proposal of eligible) {
    let scheduledStartAt: string | null = null;
    let scheduledEndAt: string | null = null;

    if (
      proposal.scheduledOffsetDays !== undefined &&
      proposal.scheduledStartHour !== undefined &&
      proposal.scheduledDurationHours !== undefined
    ) {
      const window = scheduleWindow(
        proposal.scheduledOffsetDays,
        proposal.scheduledStartHour,
        proposal.scheduledDurationHours,
      );
      scheduledStartAt = window.startAt;
      scheduledEndAt = window.endAt;
    }

    await db.insert(proposals).values({
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      proposalType: proposal.proposalType,
      state: proposal.state,
      proposerId: proposal.proposerId,
      locationId: proposal.locationId,
      scheduledStartAt,
      scheduledEndAt,
      intentionalSolo: false,
      notes: proposal.notes,
      createdAt: now,
      updatedAt: now,
    });

    for (const inviteeId of proposal.inviteeIds ?? []) {
      if (!userIds.has(inviteeId)) continue;
      await db.insert(proposalInvitees).values({
        id: `pi-${randomUUID()}`,
        proposalId: proposal.id,
        userId: inviteeId,
        role: "required",
        createdAt: now,
      });
    }

    for (let index = 0; index < (proposal.timeSlots ?? []).length; index += 1) {
      const slot = proposal.timeSlots![index];
      const window = scheduleWindow(
        slot.startOffsetDays,
        slot.startHour,
        slot.durationHours,
      );
      await db.insert(proposalTimeSlots).values({
        id: `pts-${proposal.id}-${index}`,
        proposalId: proposal.id,
        startAt: window.startAt,
        endAt: window.endAt,
        label: slot.label ?? null,
        sortOrder: index,
        createdAt: now,
      });
    }
  }

  return { seeded: true, count: eligible.length };
}
