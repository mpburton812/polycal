import type { ProposalState } from "@/lib/db/schema";
import type { ScheduleSliceKind } from "@/lib/schedule/slice-types";
import type { ProposalCommentView } from "./types";

export interface ProposalSliceDetail {
  rootProposalId: string;
  sliceKind: ScheduleSliceKind;
  sliceKey: string;
  sliceTag: string;
  title: string;
  description: string | null;
  locationName: string | null;
  startAt: string;
  endAt: string | null;
  isAllDay: boolean;
  proposalType: "event" | "sleeping";
  parentState: ProposalState;
  parentTitle: string;
  participantNames: string[];
  intentionalSolo: boolean;
  isContentMasked: boolean;
  canComment: boolean;
  canDetach: boolean;
  canVoteOnParent: boolean;
  comments: ProposalCommentView[];
}
