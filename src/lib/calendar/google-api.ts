/**
 * Google Calendar API v3 adapter (PC-339).
 */
import {
  nextAllDayDate,
  toAllDayDate,
  type CalendarEventPayload,
} from "@/lib/calendar/payloads";

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
}

function googleEventBody(payload: CalendarEventPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: payload.title,
    description: payload.description ?? undefined,
    location: payload.location ?? undefined,
    transparency: payload.transparencyFree ? "transparent" : "opaque",
  };

  if (payload.isAllDay) {
    const startDate = payload.startAt.slice(0, 10);
    const endDate = payload.endAt
      ? (() => {
          const ymd = nextAllDayDate(payload.endAt);
          return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
        })()
      : (() => {
          const ymd = nextAllDayDate(payload.startAt);
          return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
        })();
    body.start = { date: startDate };
    body.end = { date: endDate };
  } else {
    body.start = { dateTime: payload.startAt };
    body.end = { dateTime: payload.endAt ?? payload.startAt };
  }

  return body;
}

async function googleFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/** Lists calendars the user can write events into. */
export async function listWritableGoogleCalendars(
  accessToken: string,
): Promise<GoogleCalendarListItem[]> {
  const res = await googleFetch(accessToken, "/users/me/calendarList?minAccessRole=writer");
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google calendarList failed: ${res.status} ${text}`);
  }
  const data = JSON.parse(text) as { items?: GoogleCalendarListItem[] };
  return (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary || item.id,
    primary: item.primary,
    accessRole: item.accessRole,
  }));
}

/** Inserts a new event; returns Google event id. */
export async function insertGoogleEvent(
  accessToken: string,
  calendarId: string,
  payload: CalendarEventPayload,
): Promise<string> {
  const res = await googleFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(googleEventBody(payload)) },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google events.insert failed: ${res.status} ${text}`);
  }
  const data = JSON.parse(text) as { id?: string };
  if (!data.id) throw new Error("Google events.insert returned no id");
  return data.id;
}

/** Patches an existing event. */
export async function patchGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  payload: CalendarEventPayload,
): Promise<void> {
  const res = await googleFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(googleEventBody(payload)) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google events.patch failed: ${res.status} ${text}`);
  }
}

/** Deletes an event (404 treated as already gone). */
export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await googleFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text();
    throw new Error(`Google events.delete failed: ${res.status} ${text}`);
  }
}

/** @deprecated internal helper kept for tests — date formatting */
export function formatGoogleAllDayStart(iso: string): string {
  return `${toAllDayDate(iso).slice(0, 4)}-${toAllDayDate(iso).slice(4, 6)}-${toAllDayDate(iso).slice(6, 8)}`;
}
