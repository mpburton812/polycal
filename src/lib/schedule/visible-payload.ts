import type { ScheduleCalendarLayout } from "@/components/schedule/scheduleViewState";
import { localDateKey, startOfWeekMonday } from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

export interface SsrWeekCoverageInput {
  layout: ScheduleCalendarLayout;
  visibleAnchor: Date;
  ssrWeekStart: Date;
  timeZone?: string;
}

/**
 * True when the SSR current-week payload is the same window the client is showing.
 * Month, day, and a week that is not the SSR Monday must refetch (PC-474 / PC-488).
 */
export function ssrWeekCoversVisibleRange(input: SsrWeekCoverageInput): boolean {
  if (input.layout !== "week") return false;
  const timeZone = input.timeZone ?? DEFAULT_VIEWER_TIMEZONE;
  const visibleMonday = startOfWeekMonday(input.visibleAnchor, timeZone);
  const ssrMonday = startOfWeekMonday(input.ssrWeekStart, timeZone);
  return (
    localDateKey(visibleMonday.toISOString(), timeZone) ===
    localDateKey(ssrMonday.toISOString(), timeZone)
  );
}
