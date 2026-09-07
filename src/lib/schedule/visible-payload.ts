import type { ScheduleCalendarLayout } from "@/components/schedule/scheduleViewState";
import { localDateKey, startOfWeekSunday } from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

export interface SsrWeekCoverageInput {
  layout: ScheduleCalendarLayout;
  visibleAnchor: Date;
  ssrWeekStart: Date;
  timeZone?: string;
}

/**
 * True when the SSR current-week payload is the same window the client is showing.
 * Month, day, and a week that is not the SSR Sunday must refetch (PC-474 / PC-488 / PC-494).
 */
export function ssrWeekCoversVisibleRange(input: SsrWeekCoverageInput): boolean {
  if (input.layout !== "week") return false;
  const timeZone = input.timeZone ?? DEFAULT_VIEWER_TIMEZONE;
  const visibleSunday = startOfWeekSunday(input.visibleAnchor, timeZone);
  const ssrSunday = startOfWeekSunday(input.ssrWeekStart, timeZone);
  return (
    localDateKey(visibleSunday.toISOString(), timeZone) ===
    localDateKey(ssrSunday.toISOString(), timeZone)
  );
}
