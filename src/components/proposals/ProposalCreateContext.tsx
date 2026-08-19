"use client";

import { createContext, useContext } from "react";

import type { ProposalDetail } from "@/actions/proposals";

export interface ProposalCreateRequest {
  lockedType?: "event" | "sleeping";
  initialStartAt?: string | null;
  /** Manual Title-first vs Description-first NLP (PC-454). */
  composerMode?: "manual" | "nlp";
  /** Prefills Title for widget / compose deep-links (PC-454). */
  initialTitle?: string;
  /** Prefills NLP Description so parseEventIntent runs as today (PC-454). */
  initialNlpText?: string;
}

export interface ProposalCreateContextValue {
  openCreate: (request?: ProposalCreateRequest) => void;
  openEdit: (detail: ProposalDetail) => void;
}

export const ProposalCreateContext = createContext<ProposalCreateContextValue | null>(null);

/**
 * Schedule day-sheet shortcuts open the shared create host (PC-418).
 */
export function useProposalCreate(): ProposalCreateContextValue {
  const value = useContext(ProposalCreateContext);
  if (!value) {
    return {
      openCreate: () => {
        /* AppShell always mounts the host; no-op keeps tests that render ScheduleClient isolated. */
      },
      openEdit: () => {
        /* Same isolated-test no-op as openCreate. */
      },
    };
  }
  return value;
}
