"use client";

import type { ScheduleFilterMode } from "@/actions/schedule";
import { civilDateAtNoonUtc, localDateKey, startOfWeekMonday } from "@/lib/schedule/dates";
import { startOfMonth } from "@/lib/schedule/month-grid";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

const STORAGE_KEY = "polycal.schedule.view";

export type ScheduleCalendarLayout = "day" | "week" | "month";

/** Unified chrome control: Daily | Weekly | Monthly (PC-488). */
export type SchedulePeriodMode = "day" | "week" | "month";

export interface ScheduleViewState {
  weekStartIso: string;
  monthAnchorIso: string;
  calendarLayout: ScheduleCalendarLayout;
  filterMode: ScheduleFilterMode;
  filterPersonId: string;
}

export function periodModeFromState(
  state: Pick<ScheduleViewState, "calendarLayout">,
): SchedulePeriodMode {
  if (state.calendarLayout === "month") return "month";
  if (state.calendarLayout === "day") return "day";
  return "week";
}

export function applyPeriodMode(
  state: ScheduleViewState,
  mode: SchedulePeriodMode,
): ScheduleViewState {
  if (mode === "month") {
    return { ...state, calendarLayout: "month" };
  }
  if (mode === "day") {
    return { ...state, calendarLayout: "day" };
  }
  return { ...state, calendarLayout: "week" };
}

const DEFAULT_STATE = (): ScheduleViewState => {
  const now = new Date();
  const monday = startOfWeekMonday(now);
  return {
    weekStartIso: monday.toISOString(),
    monthAnchorIso: startOfMonth(now).toISOString(),
    calendarLayout: "week",
    filterMode: "whole",
    filterPersonId: "",
  };
};

/**
 * Reads persisted schedule UI preferences from localStorage (PC-42 / PC-164 / PC-411 / PC-488).
 * Layout + filters restore; week/month anchors are NOT restored so Schedule opens on today.
 * Legacy `compact` / twoWeek storage is ignored.
 */
export function loadScheduleViewState(): ScheduleViewState {
  const defaults = DEFAULT_STATE();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ScheduleViewState> & { compact?: boolean };
    const layout = parsed.calendarLayout;
    const calendarLayout: ScheduleCalendarLayout =
      layout === "day" || layout === "week" || layout === "month"
        ? layout
        : defaults.calendarLayout;
    return {
      ...defaults,
      calendarLayout,
      filterMode: parsed.filterMode ?? defaults.filterMode,
      filterPersonId: parsed.filterPersonId ?? defaults.filterPersonId,
      // Always use today-based anchors from DEFAULT_STATE (PC-411).
    };
  } catch {
    return defaults;
  }
}

/**
 * Persists schedule layout + filters. Anchors are written for URL sync but ignored on next load (PC-411).
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
 * Parses schedule URL query params (PC-167 / PC-488).
 * Legacy `layout=twoWeek` coerces to weekly.
 */
export function parseScheduleUrlParams(search: string): ScheduleUrlParams {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const layoutRaw = params.get("layout");
  let layout: SchedulePeriodMode | undefined;
  if (layoutRaw === "twoWeek") {
    layout = "week";
  } else if (layoutRaw === "day" || layoutRaw === "week" || layoutRaw === "month") {
    layout = layoutRaw;
  }
  const anchor = params.get("anchor") ?? undefined;
  const open = params.get("open") ?? undefined;
  return { layout, anchor, open };
}

/**
 * Builds schedule URL search string from view state (PC-167).
 * Anchor uses local calendar YYYY-MM-DD (not UTC slice of ISO) to avoid remount loops.
 */
export function buildScheduleUrlSearch(
  state: ScheduleViewState,
  openProposalId?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("layout", periodModeFromState(state));
  const anchorDate =
    state.calendarLayout === "month"
      ? new Date(state.monthAnchorIso)
      : new Date(state.weekStartIso);
  params.set("anchor", localCalendarDateKey(anchorDate));
  if (openProposalId) params.set("open", openProposalId);
  return params.toString();
}

/** Local calendar day as yyyy-MM-dd (PC-167). */
export function localCalendarDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Anchors “Today” — Monday of current week + current month (PC-164).
 * Day mode overrides weekStartIso to local noon of today in ScheduleClient.
 */
export function todayAnchors(
  now = new Date(),
): Pick<ScheduleViewState, "weekStartIso" | "monthAnchorIso"> {
  return {
    weekStartIso: startOfWeekMonday(now).toISOString(),
    monthAnchorIso: startOfMonth(now).toISOString(),
  };
}

/**
 * Normalizes an anchor to noon-UTC on that civil day in `timeZone` (PC-204 / PC-376).
 */
export function startOfLocalDayNoon(
  date: Date,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date {
  const key = localDateKey(date.toISOString(), timeZone);
  return civilDateAtNoonUtc(key);
}
