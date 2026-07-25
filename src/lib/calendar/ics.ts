/**
 * iCalendar (.ics) builder for iCal/Other delivery (PC-340 / PC-351).
 * Supports one or many VEVENTs in a single VCALENDAR (batch per-night).
 */
import {
  buildIcsUid,
  nextAllDayDate,
  toAllDayDate,
  toIcsUtc,
  type CalendarEventPayload,
} from "@/lib/calendar/payloads";
import type { IcsMethod } from "@/lib/calendar/types";

function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return parts.join("\r\n");
}

export interface IcsVEventInput {
  uid: string;
  sequence: number;
  payload: CalendarEventPayload;
  /** Override METHOD-derived STATUS (e.g. CANCELLED for removed nights). */
  status?: "CONFIRMED" | "CANCELLED";
}

export interface BuildIcsInput {
  userId: string;
  proposalId: string;
  payload: CalendarEventPayload;
  sequence: number;
  method: IcsMethod;
  uid?: string;
}

export interface BuildIcsMultiInput {
  method: IcsMethod;
  events: IcsVEventInput[];
  /** Filename stem preference (first event title used when omitted). */
  filenameTitle?: string;
}

function appendVEvent(lines: string[], event: IcsVEventInput, method: IcsMethod, now: string): void {
  const eventStatus =
    event.status === "CANCELLED" || method === "CANCEL" ? "CANCELLED" : "CONFIRMED";

  lines.push(
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${now}`,
    `SEQUENCE:${Math.max(0, event.sequence)}`,
    `SUMMARY:${escapeText(event.payload.title)}`,
  );

  if (event.payload.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeText(event.payload.description.trim())}`);
  }
  if (event.payload.location?.trim()) {
    lines.push(`LOCATION:${escapeText(event.payload.location.trim())}`);
  }

  if (event.payload.isAllDay) {
    const start = toAllDayDate(event.payload.startAt);
    const endExclusive = event.payload.endAt
      ? nextAllDayDate(event.payload.endAt)
      : nextAllDayDate(event.payload.startAt);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${endExclusive}`);
  } else {
    lines.push(`DTSTART:${toIcsUtc(event.payload.startAt)}`);
    const endIso = event.payload.endAt ?? event.payload.startAt;
    lines.push(`DTEND:${toIcsUtc(endIso)}`);
  }

  lines.push(
    event.payload.transparencyFree ? "TRANSP:TRANSPARENT" : "TRANSP:OPAQUE",
    `STATUS:${eventStatus}`,
    "END:VEVENT",
  );
}

function filenameFromTitle(title: string): string {
  const safeName =
    title
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .slice(0, 40)
      .replace(/\s+/g, "-")
      .toLowerCase() || "polycal-event";
  return `${safeName}.ics`;
}

/**
 * Builds a VCALENDAR with one or more VEVENTs (PC-351 batch nights).
 */
export function buildIcsMultiDocument(input: BuildIcsMultiInput): {
  primaryUid: string;
  body: string;
  filename: string;
} {
  const now = toIcsUtc(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PolyCal//Calendar Integration//EN",
    `METHOD:${input.method}`,
    "CALSCALE:GREGORIAN",
  ];

  for (const event of input.events) {
    appendVEvent(lines, event, input.method, now);
  }

  lines.push("END:VCALENDAR");

  const body = `${lines.map(foldLine).join("\r\n")}\r\n`;
  const title =
    input.filenameTitle ?? input.events[0]?.payload.title ?? "polycal-event";
  return {
    primaryUid: input.events[0]?.uid ?? "",
    body,
    filename: filenameFromTitle(title),
  };
}

/**
 * Builds a VCALENDAR document for download or email attachment (single VEVENT).
 */
export function buildIcsDocument(input: BuildIcsInput): { uid: string; body: string; filename: string } {
  const uid = input.uid ?? buildIcsUid(input.userId, input.proposalId, input.payload.nightKey ?? "");
  const doc = buildIcsMultiDocument({
    method: input.method,
    events: [
      {
        uid,
        sequence: input.sequence,
        payload: input.payload,
      },
    ],
    filenameTitle: input.payload.title,
  });
  return { uid, body: doc.body, filename: doc.filename };
}
