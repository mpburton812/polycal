"use client";

import { useCallback, useState } from "react";

import type { ProposalDetail } from "@/actions/proposals";
import type { ScheduleEvent } from "@/actions/schedule";
import { isSliceGroupKind } from "@/lib/schedule/schedule-slices";
import type { ScheduleSliceKind } from "@/lib/schedule/slice-types";

export interface SliceDialogContext {
  rootProposalId: string;
  sliceKind: "batch_night" | "virtual_span_day";
  sliceKey: string;
}

export interface ScheduleTapRouterState {
  selectedProposalId: string | null;
  detailOpen: boolean;
  sliceOpen: boolean;
  sliceContext: SliceDialogContext | null;
  chooserOpen: boolean;
  chooserEvent: ScheduleEvent | null;
  draftOpen: boolean;
  editDetail: ProposalDetail | null;
  createLockedType: "event" | "sleeping" | null;
  createInitialStartAt: string | null;
}

const INITIAL_STATE: ScheduleTapRouterState = {
  selectedProposalId: null,
  detailOpen: false,
  sliceOpen: false,
  sliceContext: null,
  chooserOpen: false,
  chooserEvent: null,
  draftOpen: false,
  editDetail: null,
  createLockedType: null,
  createInitialStartAt: null,
};

/**
 * Encapsulates schedule tap routing and mutually exclusive dialog state.
 */
export function useScheduleTapRouter() {
  const [state, setState] = useState<ScheduleTapRouterState>(INITIAL_STATE);

  const closeAllDialogs = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const openProposal = useCallback((proposalId: string) => {
    setState({
      ...INITIAL_STATE,
      selectedProposalId: proposalId,
      detailOpen: true,
    });
  }, []);

  const openScheduleEvent = useCallback((event: ScheduleEvent) => {
    // Recurrence: open the occurrence directly; series edit lives in detail (PC-166).
    if (event.sliceKind === "recurrence_occurrence" && event.occurrenceProposalId) {
      openProposal(event.occurrenceProposalId);
      return;
    }

    if (isSliceGroupKind(event.sliceKind)) {
      setState({
        ...INITIAL_STATE,
        sliceOpen: true,
        sliceContext: {
          rootProposalId: event.rootProposalId,
          sliceKind: event.sliceKind as "batch_night" | "virtual_span_day",
          sliceKey: event.sliceKey,
        },
      });
      return;
    }

    openProposal(event.occurrenceProposalId ?? event.proposalId);
  }, [openProposal]);

  /** Explicit chooser for occurrence vs series when the user asks from detail. */
  const openRecurrenceChooser = useCallback((event: ScheduleEvent) => {
    setState({
      ...INITIAL_STATE,
      chooserOpen: true,
      chooserEvent: event,
    });
  }, []);

  const closeDetail = useCallback(() => {
    setState((current) => ({
      ...current,
      detailOpen: false,
      selectedProposalId: null,
    }));
  }, []);

  const closeSlice = useCallback(() => {
    setState((current) => ({
      ...current,
      sliceOpen: false,
      sliceContext: null,
    }));
  }, []);

  const closeChooser = useCallback(() => {
    setState((current) => ({
      ...current,
      chooserOpen: false,
      chooserEvent: null,
    }));
  }, []);

  const closeDraft = useCallback(() => {
    setState((current) => ({
      ...current,
      draftOpen: false,
      editDetail: null,
    }));
  }, []);

  const handleEditFromDetail = useCallback((detail: ProposalDetail) => {
    setState({
      ...INITIAL_STATE,
      draftOpen: true,
      editDetail: detail,
    });
  }, []);

  const openCreateDraft = useCallback(
    (opts: { lockedType: "event" | "sleeping"; initialStartAt?: string }) => {
      setState({
        ...INITIAL_STATE,
        draftOpen: true,
        createLockedType: opts.lockedType,
        createInitialStartAt: opts.initialStartAt ?? null,
      });
    },
    [],
  );

  const openRelatedProposal = useCallback((proposalId: string) => {
    setState((current) => ({
      ...current,
      selectedProposalId: proposalId,
      detailOpen: true,
      sliceOpen: false,
      sliceContext: null,
      chooserOpen: false,
      chooserEvent: null,
    }));
  }, []);

  const openDetachedProposal = useCallback((newProposalId: string) => {
    setState({
      ...INITIAL_STATE,
      selectedProposalId: newProposalId,
      detailOpen: true,
    });
  }, []);

  return {
    state,
    openProposal,
    openScheduleEvent,
    openRecurrenceChooser,
    closeDetail,
    closeSlice,
    closeChooser,
    closeDraft,
    closeAllDialogs,
    handleEditFromDetail,
    openRelatedProposal,
    openDetachedProposal,
    openCreateDraft,
  };
}

export type { ScheduleSliceKind };
