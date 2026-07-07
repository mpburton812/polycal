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

export type { ProposalSliceDetail } from "./proposals/slice-types";

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

export {
  detachProposalSliceAction,
  getProposalSliceDetailAction,
} from "./proposals/slices";

export { listProposalBoardAction } from "./proposals/board";
export { deleteDraftProposalAction } from "./proposals/mutations";
