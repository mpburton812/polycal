import { getDb } from "@/lib/db/client";
import {
  proposals,
  locations,
  users,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import { isNonProductionEnvironment } from "@/lib/env";

interface DemoProposal {
  id: string;
  title: string;
  description: string;
  proposalType: ProposalType;
  state: ProposalState;
  proposerId: string;
  locationId?: string;
  notes?: string;
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
  },
  {
    id: "prop-proposed-2",
    title: "Falcon overnight — Tatooine",
    description: "Multi-night sleeping proposal in poll state.",
    proposalType: "sleeping",
    state: "proposed",
    proposerId: "sw-han",
    locationId: "loc-tatooine",
  },
  {
    id: "prop-proposed-3",
    title: "Death Star planning session",
    description: "Optional voters may abstain.",
    proposalType: "event",
    state: "proposed",
    proposerId: "sw-vader",
    locationId: "loc-deathstar",
  },
  {
    id: "prop-resolved-1",
    title: "Yavin 4 victory celebration",
    description: "Approved and on the calendar.",
    proposalType: "event",
    state: "resolved",
    proposerId: "sw-luke",
    locationId: "loc-falcon",
  },
  {
    id: "prop-resolved-2",
    title: "Cloud City hospitality suite",
    description: "Resolved sleeping arrangement.",
    proposalType: "sleeping",
    state: "resolved",
    proposerId: "sw-lando",
    locationId: "loc-cloudcity",
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
    await db.insert(proposals).values({
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      proposalType: proposal.proposalType,
      state: proposal.state,
      proposerId: proposal.proposerId,
      locationId: proposal.locationId,
      notes: proposal.notes,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { seeded: true, count: eligible.length };
}
