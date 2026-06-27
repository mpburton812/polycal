"use client";

import type { ScheduleFilterMode } from "@/actions/schedule";

const STORAGE_KEY = "polycal.schedule.view";

export type ScheduleCalendarLayout = "week" | "month";

export interface ScheduleViewState {
  weekStartIso: string;
  monthAnchorIso: string;
  calendarLayout: ScheduleCalendarLayout;
  compact: boolean;
  filterMode: ScheduleFilterMode;
  filterPersonId: string;
  planningOpen: boolean;
}

const DEFAULT_STATE = (): ScheduleViewState => ({
  weekStartIso: new Date().toISOString(),
  monthAnchorIso: new Date().toISOString(),
  calendarLayout: "week",
  compact: false,
  filterMode: "whole",
  filterPersonId: "",
  planningOpen: false,
});

/**
 * Reads persisted schedule UI preferences from localStorage (PC-42).
 */
export function loadScheduleViewState(): ScheduleViewState {
  const defaults = DEFAULT_STATE();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ScheduleViewState>;
    return {
      ...defaults,
      compact: parsed.compact ?? defaults.compact,
      calendarLayout: parsed.calendarLayout ?? defaults.calendarLayout,
      filterMode: parsed.filterMode ?? defaults.filterMode,
      filterPersonId: parsed.filterPersonId ?? defaults.filterPersonId,
      planningOpen: parsed.planningOpen ?? defaults.planningOpen,
      weekStartIso: defaults.weekStartIso,
      monthAnchorIso: defaults.monthAnchorIso,
    };
  } catch {
    return defaults;
  }
}

/**
 * Persists schedule UI preferences for the next visit (PC-42).
 * Week anchor is intentionally excluded so the calendar opens on the current week.
 */
export function saveScheduleViewState(state: ScheduleViewState): void {
  if (typeof window === "undefined") return;
  const { weekStartIso: _week, monthAnchorIso: _month, ...persisted } = state;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}
