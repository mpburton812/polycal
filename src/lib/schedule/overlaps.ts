import { intervalsOverlap } from "@/lib/schedule/dates";
import { sleepingCalendarDayEnd } from "@/lib/proposals/sleeping-schedule";

export interface OverlapCandidate {
  proposalType: "event" | "sleeping";
  startAt: string;
  endAt: string | null;
  participantIds: string[];
  hasOverlap: boolean;
}

/**
 * Expands a schedule window's end bound for overlap comparison. Sleeping proposals
 * are calendar-date-only and often have a null/same-day end — widen to the end of
 * the calendar day so same-night arrangements correctly detect as overlapping.
 */
function overlapEndBound(event: Pick<OverlapCandidate, "proposalType" | "startAt" | "endAt">): string {
  if (event.proposalType !== "sleeping") return event.endAt ?? event.startAt;
  return sleepingCalendarDayEnd(event.endAt ?? event.startAt).toISOString();
}

/**
 * Flags calendar entries that overlap in time and share a participant.
 * Sleeping arrangements never conflict with events — same rule as proposal
 * scheduling conflicts (PC-59 parity) — so only same-type pairs are compared.
 */
export function markOverlaps<T extends OverlapCandidate>(events: T[]): T[] {
  const flagged = events.map((event) => ({ ...event }));
  for (let i = 0; i < flagged.length; i += 1) {
    for (let j = i + 1; j < flagged.length; j += 1) {
      const a = flagged[i]!;
      const b = flagged[j]!;
      if (a.proposalType !== b.proposalType) continue;
      if (
        intervalsOverlap(a.startAt, overlapEndBound(a), b.startAt, overlapEndBound(b)) &&
        a.participantIds.some((id) => b.participantIds.includes(id))
      ) {
        flagged[i]!.hasOverlap = true;
        flagged[j]!.hasOverlap = true;
      }
    }
  }
  return flagged;
}
