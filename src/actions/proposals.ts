/**
 * Stable public API for proposal server actions (PC-62 module split).
 */
export type {
  ProposalBoard,
  ProposalCard,
  ProposalCardKind,
  ProposalCommentView,
  ProposalConflictWarning,
  ProposalDetail,
  ProposalInviteeView,
  ProposalPlaceOption,
  ProposalSlotVoteView,
  ProposalStateLogView,
  ProposalTimeSlotView,
  RecurrencePattern,
  RecurrenceRule,
} from "./proposals/types";

export {
  acknowledgeProposalOverlapAction,
  addProposalCommentAction,
  cancelProposalAction,
  castProposalVoteAction,
  castSlotVoteAction,
  checkProposalConflictsAction,
  cloneProposalAction,
  createDraftProposalAction,
  getProposalDetailAction,
  listAcceptedSleepingPartnerIdsAction,
  listProposalPlaceOptionsAction,
  listSleepingLocationOptionsAction,
  redraftProposalAction,
  rescheduleProposalAction,
  respondAttendeeUpdateAction,
  revokeResolvedAcceptanceAction,
  submitProposalAction,
  updateDraftProposalAction,
  updateResolvedAttendeesAction,
} from "./proposals/_core";

export { listProposalBoardAction } from "./proposals/board";
export { deleteDraftProposalAction } from "./proposals/mutations";
