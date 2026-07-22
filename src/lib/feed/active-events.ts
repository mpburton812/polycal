interface EventTimingCandidate {
  proposalType: string;
  state: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
}

/**
 * Resolves the inclusive end of an event so instantaneous events use their
 * start timestamp as the only moment when they are considered active (PC-298).
 */
export function getEffectiveEventEndAt(
  scheduledStartAt: string | null,
  scheduledEndAt: string | null,
): string | null {
  return scheduledEndAt ?? scheduledStartAt;
}

/**
 * Determines whether a resolved, non-sleeping proposal overlaps the supplied
 * instant. ISO timestamps are parsed before inclusive boundary comparison so
 * malformed values fail closed instead of producing an active Feed pin (PC-298).
 */
export function isEventHappeningNow(
  event: EventTimingCandidate,
  now: Date = new Date(),
): boolean {
  if (event.proposalType !== "event" || event.state !== "resolved") return false;

  const effectiveEndAt = getEffectiveEventEndAt(
    event.scheduledStartAt,
    event.scheduledEndAt,
  );
  if (!event.scheduledStartAt || !effectiveEndAt) return false;

  const startMs = Date.parse(event.scheduledStartAt);
  const endMs = Date.parse(effectiveEndAt);
  const nowMs = now.getTime();
  if (![startMs, endMs, nowMs].every(Number.isFinite)) return false;

  return startMs <= nowMs && nowMs <= endMs;
}
