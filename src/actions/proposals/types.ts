import type {
  InviteeRole,
  InviteeVoteStatus,
  ProposalState,
  ProposalType,
} from "@/lib/db/schema";
import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";

export type ProposalCardKind = "proposal" | "partnership" | "residency";

export interface ProposalCard {
  id: string;
  title: string;
  description: string | null;
  proposalType: ProposalType;
  state: ProposalState;
  proposerId: string;
  proposerName: string;
  locationName: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  atRisk: boolean;
  isPoll: boolean;
  isAllDay: boolean;
  isContentMasked: boolean;
  /** True when the viewer must act on a proposed item. */
  needsViewerAction: boolean;
  inviteeCount: number;
  respondedCount: number;
  /** Invitees still at not_seen (PC-292). */
  pendingVoteCount?: number;
  /** ISO when proposed enforcement would expire this item (PC-292). */
  proposedExpiresAt?: string | null;
  /** Pass-through at-risk TTL when flagged (PC-292). */
  atRiskExpiresAt?: string | null;
  /** Viewer may nudge pending voters (PC-293). */
  canNudge?: boolean;
  /** Last nudge timestamp for cooldown UI (PC-293). */
  lastNudgeAt?: string | null;
  /** Admin may hard-delete this proposal in any state (PC-295). */
  canAdminDeleteProposal?: boolean;
  isPastSchedule: boolean;
  /** Resolved proposal with no schedulable calendar windows in any range. */
  notOnCalendar?: boolean;
  cardKind?: ProposalCardKind;
  partnershipId?: string;
  partnerName?: string;
  residencyId?: string;
  residencyPlaceName?: string;
  residencyInviteeName?: string;
  /** Residency/partnership workflow status when Kanban state is mapped for display. */
  workflowStatus?: "proposed" | "declined";
  /** Residency proposals using standard draft workflow (PC-60). */
  specialKind?: "residency";
  /** Category icon key; null when masked or unset (PC-116). */
  eventIconKey?: string | null;
  /** True when the current viewer is an invitee on this proposal (PC-274). */
  viewerIsInvitee?: boolean;
  /** Sleeping batch proposal (PC-124). */
  isBatchSleeping?: boolean;
  /** Recurring series parent or child (PC-124). */
  isRecurring?: boolean;
  /** Resolved bedroom label when sleeping + bedroomIndex set (PC-124). */
  bedroomLabel?: string | null;
  /**
   * Latest non-dismissed ICS pending id for the current viewer (PC-345).
   * Present after download so Download ICS remains available.
   */
  pendingIcsId?: string | null;
}

export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  pattern: RecurrencePattern;
  interval: number;
  count: number;
}

export interface ProposalBoard {
  draft: ProposalCard[];
  proposed: ProposalCard[];
  resolved: ProposalCard[];
  archived: ProposalCard[];
}

export interface ProposalPlaceOption {
  id: string;
  name: string;
  bedroomCount: number;
  bedroomNames: string[];
  /** Accepted owner display names (residency picker). */
  owners?: string[];
  /** Accepted resident (non-owner) display names. */
  residents?: string[];
  /** Accepted resident user ids for home quick-buttons (PC-436). */
  residentUserIds?: string[];
}

export interface ProposalInviteeView {
  userId: string;
  displayName: string;
  role: InviteeRole;
  voteStatus: InviteeVoteStatus;
  viewedAt: string | null;
  /** RBAC role of the invitee user (`passive` in DB = Proxy in UI) (PC-246 / PC-256). */
  userRole: string;
  /** Who added this invitee (audit). */
  addedByUserId: string | null;
  /** Viewer may cast a proxy vote for this invitee (PC-255). */
  canProxyVote: boolean;
}

export interface ProposalTimeSlotView {
  id: string;
  startAt: string;
  endAt: string | null;
  label: string | null;
  isAllDay: boolean;
}

export interface ProposalSlotVoteView {
  timeSlotId: string;
  userId: string;
  displayName: string;
  voteStatus: InviteeVoteStatus;
}

export interface ProposalConflictWarning {
  userId: string;
  displayName: string;
  conflictingTitle: string;
  conflictingState: ProposalState;
  overlapStart: string;
  overlapEnd: string | null;
  /** Bedroom or place asset lock conflict (PC-40). */
  conflictKind?: "schedule" | "place_asset";
}

export interface ProposalDetail {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  proposalType: ProposalType;
  state: ProposalState;
  proposerId: string;
  proposerName: string;
  locationId: string | null;
  locationText: string | null;
  locationName: string | null;
  intentionalSolo: boolean;
  isPoll: boolean;
  isAllDay: boolean;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  atRisk: boolean;
  isContentMasked: boolean;
  isRecurring: boolean;
  isRecurrenceParent: boolean;
  parentProposalId: string | null;
  recurrenceRule: RecurrenceRule | null;
  occurrenceIndex: number | null;
  bedroomIndex: number | null;
  /** Resolved bedroom name when index is set (PC-124). */
  bedroomLabel: string | null;
  isBatchSleeping: boolean;
  batchEntries: BatchSleepingEntry[];
  /** Resolved place names for batch entry locationId values (PC-69). */
  batchPlaceNames: Record<string, string>;
  invitees: ProposalInviteeView[];
  timeSlots: ProposalTimeSlotView[];
  slotVotes: ProposalSlotVoteView[];
  winningSlotId: string | null;
  comments: ProposalCommentView[];
  stateLog: ProposalStateLogView[];
  canEdit: boolean;
  canVote: boolean;
  canVoteSlots: boolean;
  canManageAttendees: boolean;
  canComment: boolean;
  canCancel: boolean;
  /** Admin hard-delete in any state (PC-295). */
  canAdminDeleteProposal: boolean;
  canRedraft: boolean;
  canReschedule: boolean;
  canAddBookedAttendee: boolean;
  canPostToFeed: boolean;
  canRevokeAcceptance: boolean;
  viewerVoteStatus: InviteeVoteStatus | null;
  viewerSlotVotes: Record<string, InviteeVoteStatus>;
  /** True when the viewer already voted but their calendar now conflicts (PC-45/46). */
  hasOverlapWarning: boolean;
  canAcknowledgeOverlap: boolean;
  /** Optional invitee still owes RSVP after required attendees resolved (PC-278 / PC-49). */
  optionalRsvpPending: boolean;
  /** Kanban/detail chip state — may show proposed while DB state is resolved (PC-49). */
  displayState: ProposalState;
  /** Minutes before event start to send reminder (PC-65). */
  reminderOffsetMinutes: number | null;
  /** Optional category icon for social events (PC-116). */
  eventIconKey: string | null;
  /** When true, lifecycle milestones appear on Feed (PC-414). */
  postToFeed: boolean;
  /** Proposal vs direct calendar booking (PC-427). */
  postingKind?: "proposal" | "booking";
  /** Proxy subject when scheduling on behalf of someone else (PC-425). */
  onBehalfOfUserId?: string | null;
  specialKind?: "residency";
  /**
   * Latest non-dismissed ICS pending id for the current viewer (PC-345).
   * Present after download so Download ICS remains available.
   */
  pendingIcsId: string | null;
}

export interface ProposalCommentView {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  sliceTag?: string | null;
}

export interface ProposalStateLogView {
  action: string;
  actorName: string | null;
  details: string | null;
  createdAt: string;
}
