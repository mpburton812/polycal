"use client";

import { createContext, useContext } from "react";

export interface ProposalCreateRequest {
  lockedType: "event" | "sleeping";
  initialStartAt?: string | null;
}

export interface ProposalCreateContextValue {
  openCreate: (request?: ProposalCreateRequest) => void;
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
    };
  }
  return value;
}
