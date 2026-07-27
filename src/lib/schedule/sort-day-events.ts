/**
 * Day-list ordering for schedule week / agenda / day sheet (PC-364).
 * Non-sleeping events sort by startAt; sleeping arrangements always come last
 * (stable by startAt among themselves).
 */

export type SortableDayEvent = {
  startAt: string;
  proposalType: "event" | "sleeping" | string;
};

/**
 * Sorts a day's events so timed/all-day events come first by startAt,
 * then sleeping arrangements by startAt.
 */
export function sortDayEvents<T extends SortableDayEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const aSleep = a.proposalType === "sleeping";
    const bSleep = b.proposalType === "sleeping";
    if (aSleep !== bSleep) return aSleep ? 1 : -1;
    return a.startAt.localeCompare(b.startAt);
  });
}
