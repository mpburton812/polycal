import type {
  EventPrivacyLevel,
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
  eventPrivacy: EventPrivacyLevel;
  isContentMasked: boolean;
  /** True when the viewer must act on a proposed item. */
  needsViewerAction: boolean;
  inviteeCount: number;
  respondedCount: number;
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
  /** Residency or group name proposals using standard draft workflow (PC-60). */
  specialKind?: "residency" | "group_name";
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
}

export interface ProposalInviteeView {
  userId: string;
  displayName: string;
  role: InviteeRole;
  voteStatus: InviteeVoteStatus;
  viewedAt: string | null;
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
  eventPrivacy: EventPrivacyLevel;
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
  canRedraft: boolean;
  canClone: boolean;
  canReschedule: boolean;
  canRevokeAcceptance: boolean;
  viewerVoteStatus: InviteeVoteStatus | null;
  viewerSlotVotes: Record<string, InviteeVoteStatus>;
  /** True when the viewer already voted but their calendar now conflicts (PC-45/46). */
  hasOverlapWarning: boolean;
  canAcknowledgeOverlap: boolean;
  /** Optional invitee still voting on a poll after required attendees resolved (PC-49). */
  optionalPollPending: boolean;
  /** Kanban/detail chip state — may show proposed while DB state is resolved (PC-49). */
  displayState: ProposalState;
  /** Minutes before event start to send reminder (PC-65). */
  reminderOffsetMinutes: number | null;
  /** Optional category icon for social events (PC-116). */
  eventIconKey: string | null;
  specialKind?: "residency" | "group_name";
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
