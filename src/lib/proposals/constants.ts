import type { InviteeVoteStatus } from "@/lib/db/schema";

/** Synthetic Kanban card id prefix for sleeping partnership proposals (PC-43). */
export const PARTNERSHIP_CARD_PREFIX = "partnership:";

/** Synthetic Kanban card id prefix for place residency proposals (PC-56). */
export const RESIDENCY_CARD_PREFIX = "residency:";

/**
 * Aggregate invitee vote statuses that count as "approving" a proposal (PC-40).
 * Shared by the resolution engine and the resolved-attendee lifecycle actions
 * (PC-328/PC-329 core carve) so the acceptance semantics stay in one place.
 */
export const APPROVING_VOTES: InviteeVoteStatus[] = [
  "accept",
  "abstain",
  "accept_suboptimal",
];

/** Per-slot poll vote statuses that count as approving that slot (PC-40). */
export const APPROVING_SLOT_VOTES: InviteeVoteStatus[] = [
  "accept",
  "abstain",
  "accept_suboptimal",
];
