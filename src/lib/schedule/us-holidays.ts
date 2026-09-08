import type { ScheduleEvent } from "@/actions/schedule";

export interface UsHoliday {
  title: string;
  dateKey: string; // YYYY-MM-DD
}

const HOLIDAY_ID_PREFIX = "us-holiday-";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Returns the nth weekday (0=Sun) of a month (0-indexed). Used for floating US holidays.
 */
export function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  const date = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  let count = 0;
  while (date.getUTCMonth() === month) {
    if (date.getUTCDay() === weekday) {
      count += 1;
      if (count === n) return date;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

/** Last weekday of a month (0=Sun) — Memorial Day is last Monday in May. */
export function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const date = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));
  while (date.getUTCMonth() === month) {
    if (date.getUTCDay() === weekday) return date;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

/** Standard US federal holidays for a civil year. */
export function getUsHolidaysForYear(year: number): UsHoliday[] {
  return [
    { title: "New Year's Day", dateKey: `${year}-01-01` },
    {
      title: "Martin Luther King Jr. Day",
      dateKey: formatDateKey(getNthWeekdayOfMonth(year, 0, 1, 3)),
    },
    {
      title: "Presidents' Day",
      dateKey: formatDateKey(getNthWeekdayOfMonth(year, 1, 1, 3)),
    },
    {
      title: "Memorial Day",
      dateKey: formatDateKey(getLastWeekdayOfMonth(year, 4, 1)),
    },
    { title: "Juneteenth National Independence Day", dateKey: `${year}-06-19` },
    { title: "Independence Day", dateKey: `${year}-07-04` },
    {
      title: "Labor Day",
      dateKey: formatDateKey(getNthWeekdayOfMonth(year, 8, 1, 1)),
    },
    {
      title: "Columbus Day",
      dateKey: formatDateKey(getNthWeekdayOfMonth(year, 9, 1, 2)),
    },
    { title: "Veterans Day", dateKey: `${year}-11-11` },
    {
      title: "Thanksgiving Day",
      dateKey: formatDateKey(getNthWeekdayOfMonth(year, 10, 4, 4)),
    },
    { title: "Christmas Day", dateKey: `${year}-12-25` },
  ];
}

/** True when a schedule row is a synthetic US holiday (never conflicts). */
export function isUsHolidayEventId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(HOLIDAY_ID_PREFIX));
}

/**
 * Builds all-day holiday ScheduleEvents overlapping [startIso, endIso].
 * Titles are plain text (no emoji). Empty participant lists so they never pair-overlap.
 */
export function getUsHolidayScheduleEvents(startIso: string, endIso: string): ScheduleEvent[] {
  const startYear = new Date(startIso).getUTCFullYear() || new Date().getUTCFullYear();
  const endYear = new Date(endIso).getUTCFullYear() || startYear;
  const startKey = startIso.slice(0, 10);
  const endKey = endIso.slice(0, 10);
  const events: ScheduleEvent[] = [];

  for (let year = startYear - 1; year <= endYear + 1; year += 1) {
    for (const holiday of getUsHolidaysForYear(year)) {
      if (holiday.dateKey < startKey || holiday.dateKey > endKey) continue;
      const id = `${HOLIDAY_ID_PREFIX}${holiday.dateKey}`;
      events.push({
        id,
        proposalId: id,
        title: holiday.title,
        startAt: `${holiday.dateKey}T12:00:00.000Z`,
        endAt: `${holiday.dateKey}T12:00:00.000Z`,
        proposalType: "event",
        state: "resolved",
        proposerId: "system",
        proposerName: "US Holidays",
        locationName: null,
        participantIds: [],
        participantNames: [],
        intentionalSolo: true,
        isContentMasked: false,
        isTentative: false,
        atRisk: false,
        hasOverlap: false,
        isPoll: false,
        isAllDay: true,
        slotLabel: null,
        sliceKind: "standalone",
        rootProposalId: id,
        sliceKey: id,
        slotId: null,
        occurrenceProposalId: null,
        eventIconKey: null,
        isPartnerOnlySleeping: false,
      });
    }
  }

  return events;
}
