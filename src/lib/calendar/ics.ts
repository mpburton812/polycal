/**
 * iCalendar (.ics) builder for iCal/Other delivery (PC-340).
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

export interface BuildIcsInput {
  userId: string;
  proposalId: string;
  payload: CalendarEventPayload;
  sequence: number;
  method: IcsMethod;
  uid?: string;
}

/**
 * Builds a VCALENDAR document for download or email attachment.
 */
export function buildIcsDocument(input: BuildIcsInput): { uid: string; body: string; filename: string } {
  const uid = input.uid ?? buildIcsUid(input.userId, input.proposalId);
  const now = toIcsUtc(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PolyCal//Calendar Integration//EN",
    `METHOD:${input.method}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `SEQUENCE:${Math.max(0, input.sequence)}`,
    `SUMMARY:${escapeText(input.payload.title)}`,
  ];

  if (input.payload.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeText(input.payload.description.trim())}`);
  }
  if (input.payload.location?.trim()) {
    lines.push(`LOCATION:${escapeText(input.payload.location.trim())}`);
  }

  if (input.payload.isAllDay) {
    const start = toAllDayDate(input.payload.startAt);
    const endExclusive = input.payload.endAt
      ? nextAllDayDate(input.payload.endAt)
      : nextAllDayDate(input.payload.startAt);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${endExclusive}`);
  } else {
    lines.push(`DTSTART:${toIcsUtc(input.payload.startAt)}`);
    const endIso = input.payload.endAt ?? input.payload.startAt;
    lines.push(`DTEND:${toIcsUtc(endIso)}`);
  }

  lines.push(
    input.payload.transparencyFree ? "TRANSP:TRANSPARENT" : "TRANSP:OPAQUE",
    input.method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  const body = `${lines.map(foldLine).join("\r\n")}\r\n`;
  const safeName = input.payload.title
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .slice(0, 40)
    .replace(/\s+/g, "-")
    .toLowerCase() || "polycal-event";
  return { uid, body, filename: `${safeName}.ics` };
}
