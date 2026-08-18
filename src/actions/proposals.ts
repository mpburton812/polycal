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
  adminCheckProposalConflictsAction,
  adminForceResolveProposalAction,
  castProposalVoteAction,
  castSlotVoteAction,
  checkProposalConflictsAction,
  createDraftProposalAction,
  getProposalDetailAction,
  listAcceptedSleepingPartnerIdsAction,
  listComposerPeopleRankAction,
  listProposalPlaceOptionsAction,
  listResidencyPlaceOptionsAction,
  listSleepingLocationOptionsAction,
  submitProposalAction,
  updateDraftProposalAction,
} from "./proposals/_core";

// Comment + lifecycle actions were carved into dedicated modules (PC-329); they
// are re-exported here so the public `@/actions/proposals` API is unchanged.
export {
  addProposalCommentAction,
  deleteProposalCommentAction,
} from "./proposals/comments";

export {
  cancelProposalAction,
  nudgePendingVotersAction,
  postProposalToFeedAction,
  redraftProposalAction,
  rescheduleProposalAction,
  respondAttendeeUpdateAction,
  returnProposedToDraftAction,
  revokeResolvedAcceptanceAction,
  updateResolvedAttendeesAction,
} from "./proposals/lifecycle";

export {
  detachProposalSliceAction,
  getProposalSliceDetailAction,
} from "./proposals/slices";

export { listProposalBoardAction } from "./proposals/board";
export { adminDeleteProposalAction, deleteDraftProposalAction } from "./proposals/mutations";
