"use client";

import type { ScheduleFilterMode } from "@/actions/schedule";

const STORAGE_KEY = "polycal.schedule.view";

export interface ScheduleViewState {
  weekStartIso: string;
  compact: boolean;
  filterMode: ScheduleFilterMode;
  filterPersonId: string;
  planningOpen: boolean;
}

const DEFAULT_STATE = (): ScheduleViewState => ({
  weekStartIso: new Date().toISOString(),
  compact: false,
  filterMode: "whole",
  filterPersonId: "",
  planningOpen: false,
});

/**
 * Reads persisted schedule UI preferences from localStorage (PC-42).
 */
export function loadScheduleViewState(): ScheduleViewState {
  if (typeof window === "undefined") return DEFAULT_STATE();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE();
    const parsed = JSON.parse(raw) as Partial<ScheduleViewState>;
    return {
      ...DEFAULT_STATE(),
      ...parsed,
      filterMode: parsed.filterMode ?? "whole",
    };
  } catch {
    return DEFAULT_STATE();
  }
}

/**
 * Persists schedule UI preferences for the next visit (PC-42).
 */
export function saveScheduleViewState(state: ScheduleViewState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
