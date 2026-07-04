/**
 * Shared, dependency-free formatting of extra proposal context for notification
 * surfaces (push body, email, in-app inbox). Kept pure so it is safe to run on
 * both server (push/email) and client (inbox) and easy to unit test.
 */

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

export interface ProposalNotificationDetailOptions {
  /** IANA timezone for rendering the "when" line; defaults to the runtime locale. */
  timeZone?: string;
}

/**
 * Formats a human "when" label for a proposal notification. All-day and sleeping
 * proposals render as a date range with no clock time; timed events include the
 * time. Returns null when the start timestamp is missing or unparseable.
 */
export function formatNotificationWhen(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  opts: {
    proposalType?: string;
    isAllDay?: boolean;
    timeZone?: string;
  } = {},
): string | null {
  const start = asNonEmptyString(startIso);
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;

  const dateOnly = opts.isAllDay === true || opts.proposalType === "sleeping";
  const baseOptions: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  };

  const startLabel = startDate.toLocaleString(undefined, baseOptions);

  const end = asNonEmptyString(endIso);
  if (!end) return startLabel;
  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return startLabel;

  // Same calendar day (in the target zone): show only the end time for timed
  // events; for date-only proposals collapse to the single date.
  const dayFormatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  });
  const sameDay = dayFormatter.format(startDate) === dayFormatter.format(endDate);
  if (sameDay) {
    if (dateOnly) return startLabel;
    const endLabel = endDate.toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
    });
    return `${startLabel} – ${endLabel}`;
  }

  const endLabel = endDate.toLocaleString(undefined, baseOptions);
  return `${startLabel} – ${endLabel}`;
}

/**
 * Builds a compact detail string (e.g. "When: Wed, Jul 15, 2:00 PM · Where: The
 * Lake House") from notification metadata. Returns an empty string when no
 * enriching context is available so callers can conditionally append it.
 */
export function buildProposalNotificationDetail(
  metadata: Record<string, unknown> | undefined,
  options: ProposalNotificationDetailOptions = {},
): string {
  if (!metadata) return "";
  const parts: string[] = [];

  const when = formatNotificationWhen(
    asNonEmptyString(metadata.scheduledStartAt),
    asNonEmptyString(metadata.scheduledEndAt),
    {
      proposalType: asNonEmptyString(metadata.proposalType) ?? undefined,
      isAllDay: asBoolean(metadata.isAllDay),
      timeZone: options.timeZone,
    },
  );
  if (when) parts.push(`When: ${when}`);

  const where =
    asNonEmptyString(metadata.placeName) ?? asNonEmptyString(metadata.locationText);
  if (where) parts.push(`Where: ${where}`);

  return parts.join(" · ");
}
