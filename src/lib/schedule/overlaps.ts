import { intervalsOverlap } from "@/lib/schedule/dates";
import { sleepingCalendarDayEnd } from "@/lib/proposals/sleeping-schedule";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";

export interface OverlapCandidate {
  proposalType: "event" | "sleeping" | "fast_sleep" | string;
  startAt: string;
  endAt: string | null;
  participantIds: string[];
  hasOverlap: boolean;
}

/** Below this size the naive pairwise pass is cheap enough and matches historical behavior. */
const DAY_BUCKET_THRESHOLD = 32;

/**
 * Expands a schedule window's end bound for overlap comparison. Sleeping proposals
 * are calendar-date-only and often have a null/same-day end — widen to the end of
 * the calendar day so same-night arrangements correctly detect as overlapping.
 */
function overlapEndBound(event: Pick<OverlapCandidate, "proposalType" | "startAt" | "endAt">): string {
  if (!isSleepingLikeType(event.proposalType)) return event.endAt ?? event.startAt;
  return sleepingCalendarDayEnd(event.endAt ?? event.startAt).toISOString();
}

/** UTC yyyy-MM-dd key from an ISO timestamp (avoids host-locale day boundaries). */
function utcDateKeyFromIso(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Adds `delta` calendar days to a UTC yyyy-MM-dd key. */
function addUtcDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/**
 * Calendar days an entry occupies for bucketing — start through overlap end bound
 * (sleeping uses sleepingCalendarDayEnd via overlapEndBound).
 */
function overlapDayKeys(event: Pick<OverlapCandidate, "proposalType" | "startAt" | "endAt">): string[] {
  const startKey = utcDateKeyFromIso(event.startAt);
  const endKey = utcDateKeyFromIso(overlapEndBound(event));
  if (endKey < startKey) return [startKey];

  const keys: string[] = [];
  let cur = startKey;
  // Cap multi-day spans so a corrupt end cannot hang the scheduler.
  for (let guard = 0; cur <= endKey && guard < 400; guard += 1) {
    keys.push(cur);
    cur = addUtcDays(cur, 1);
  }
  return keys.length > 0 ? keys : [startKey];
}

/** True when two candidates conflict on type, time, and shared participant. */
function pairOverlaps(a: OverlapCandidate, b: OverlapCandidate): boolean {
  if (a.proposalType !== b.proposalType) return false;
  return (
    intervalsOverlap(a.startAt, overlapEndBound(a), b.startAt, overlapEndBound(b)) &&
    a.participantIds.some((id) => b.participantIds.includes(id))
  );
}

/** Classic O(n²) pass — used for small lists where bucketing overhead is unnecessary. */
function markOverlapsNaive<T extends OverlapCandidate>(flagged: T[]): void {
  for (let i = 0; i < flagged.length; i += 1) {
    for (let j = i + 1; j < flagged.length; j += 1) {
      if (pairOverlaps(flagged[i]!, flagged[j]!)) {
        flagged[i]!.hasOverlap = true;
        flagged[j]!.hasOverlap = true;
      }
    }
  }
}

/**
 * Day-bucket pass for larger lists: only compare pairs that share a UTC calendar day.
 * Multi-day entries land in every day they span; pair keys avoid duplicate work.
 */
function markOverlapsByDayBuckets<T extends OverlapCandidate>(flagged: T[]): void {
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < flagged.length; i += 1) {
    for (const day of overlapDayKeys(flagged[i]!)) {
      const list = buckets.get(day);
      if (list) list.push(i);
      else buckets.set(day, [i]);
    }
  }

  const compared = new Set<string>();
  for (const indices of buckets.values()) {
    for (let a = 0; a < indices.length; a += 1) {
      for (let b = a + 1; b < indices.length; b += 1) {
        const i = indices[a]!;
        const j = indices[b]!;
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (compared.has(key)) continue;
        compared.add(key);
        if (pairOverlaps(flagged[i]!, flagged[j]!)) {
          flagged[i]!.hasOverlap = true;
          flagged[j]!.hasOverlap = true;
        }
      }
    }
  }
}

/**
 * Flags calendar entries that overlap in time and share a participant.
 * Sleeping arrangements never conflict with events — same rule as proposal
 * scheduling conflicts (PC-59 parity) — so only same-type pairs are compared.
 * Large lists use day buckets (PC-282) to avoid a full O(n²) scan.
 */
export function markOverlaps<T extends OverlapCandidate>(events: T[]): T[] {
  const flagged = events.map((event) => ({ ...event }));
  if (flagged.length < 2) return flagged;

  if (flagged.length <= DAY_BUCKET_THRESHOLD) {
    markOverlapsNaive(flagged);
  } else {
    markOverlapsByDayBuckets(flagged);
  }
  return flagged;
}
