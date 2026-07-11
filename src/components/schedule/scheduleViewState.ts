"use client";

import type { ScheduleFilterMode } from "@/actions/schedule";
import { startOfWeekMonday } from "@/lib/schedule/dates";
import { startOfMonth } from "@/lib/schedule/month-grid";

const STORAGE_KEY = "polycal.schedule.view";

export type ScheduleCalendarLayout = "week" | "month";

/** Unified chrome control: Week | 2 weeks | Month (PC-164). */
export type SchedulePeriodMode = "week" | "twoWeek" | "month";

export interface ScheduleViewState {
  weekStartIso: string;
  monthAnchorIso: string;
  calendarLayout: ScheduleCalendarLayout;
  compact: boolean;
  filterMode: ScheduleFilterMode;
  filterPersonId: string;
  planningOpen: boolean;
}

export function periodModeFromState(state: Pick<ScheduleViewState, "calendarLayout" | "compact">): SchedulePeriodMode {
  if (state.calendarLayout === "month") return "month";
  return state.compact ? "twoWeek" : "week";
}

export function applyPeriodMode(
  state: ScheduleViewState,
  mode: SchedulePeriodMode,
): ScheduleViewState {
  if (mode === "month") {
    return { ...state, calendarLayout: "month", compact: false };
  }
  return {
    ...state,
    calendarLayout: "week",
    compact: mode === "twoWeek",
  };
}

const DEFAULT_STATE = (): ScheduleViewState => {
  const now = new Date();
  const monday = startOfWeekMonday(now);
  return {
    weekStartIso: monday.toISOString(),
    monthAnchorIso: startOfMonth(now).toISOString(),
    calendarLayout: "week",
    compact: false,
    filterMode: "whole",
    filterPersonId: "",
    planningOpen: false,
  };
};

/**
 * Reads persisted schedule UI preferences from localStorage (PC-42 / PC-164).
 * Anchors are persisted so returning to Schedule restores the last viewed period.
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
      weekStartIso: parsed.weekStartIso ?? defaults.weekStartIso,
      monthAnchorIso: parsed.monthAnchorIso ?? defaults.monthAnchorIso,
    };
  } catch {
    return defaults;
  }
}

/**
 * Persists schedule UI preferences including last-viewed anchors (PC-164).
 */
export function saveScheduleViewState(state: ScheduleViewState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export interface ScheduleUrlParams {
  layout?: SchedulePeriodMode;
  anchor?: string;
  open?: string;
}

/**
 * Parses schedule URL query params (PC-167).
 */
export function parseScheduleUrlParams(search: string): ScheduleUrlParams {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const layoutRaw = params.get("layout");
  const layout =
    layoutRaw === "week" || layoutRaw === "twoWeek" || layoutRaw === "month"
      ? layoutRaw
      : undefined;
  const anchor = params.get("anchor") ?? undefined;
  const open = params.get("open") ?? undefined;
  return { layout, anchor, open };
}

/**
 * Builds schedule URL search string from view state (PC-167).
 */
export function buildScheduleUrlSearch(
  state: ScheduleViewState,
  openProposalId?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("layout", periodModeFromState(state));
  const anchor =
    state.calendarLayout === "month" ? state.monthAnchorIso : state.weekStartIso;
  params.set("anchor", anchor.slice(0, 10));
  if (openProposalId) params.set("open", openProposalId);
  return params.toString();
}

/**
 * Anchors “Today” — Monday of current week + current month (PC-164).
 */
export function todayAnchors(now = new Date()): Pick<ScheduleViewState, "weekStartIso" | "monthAnchorIso"> {
  return {
    weekStartIso: startOfWeekMonday(now).toISOString(),
    monthAnchorIso: startOfMonth(now).toISOString(),
  };
}
