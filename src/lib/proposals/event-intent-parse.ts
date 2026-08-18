import * as chrono from "chrono-node";

export type EventIntentChipKind = "title" | "date" | "time" | "location";

export interface EventIntentPerson {
  id: string;
  displayName: string;
}

export interface EventIntentPlace {
  id: string;
  name: string;
  residentUserIds?: readonly string[];
}

export interface EventIntentParseInput {
  text: string;
  now?: Date;
  people?: readonly EventIntentPerson[];
  places?: readonly EventIntentPlace[];
  viewerId?: string;
}

export interface EventIntentChip {
  kind: EventIntentChipKind;
  label: string;
}

export interface EventIntentParseResult {
  title: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  locationText: string | null;
  locationId: string | null;
  personIds: string[];
  proposalType: "event" | "sleeping" | null;
  chips: EventIntentChip[];
}

const SLEEPING_RE = /\b(overnight|sleep(?:ing)?|spend the night|night at)\b/i;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeKey(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function hasClock(date: Date, known: { hour?: boolean; minute?: boolean } | undefined): boolean {
  if (known?.hour || known?.minute) return true;
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

/**
 * Parses Fantastical-style event text into title, dates, times, people, and place.
 */
export function parseEventIntent(input: EventIntentParseInput): EventIntentParseResult {
  const text = input.text.trim();
  const now = input.now ?? new Date();
  const people = input.people ?? [];
  const places = input.places ?? [];
  const empty: EventIntentParseResult = {
    title: "",
    startDate: null,
    endDate: null,
    startTime: null,
    endTime: null,
    allDay: true,
    locationText: null,
    locationId: null,
    personIds: [],
    proposalType: null,
    chips: [],
  };
  if (!text) return empty;

  const results = chrono.parse(text, now, { forwardDate: true });
  const first = results[0];
  let remainder = text;
  let startDate: string | null = null;
  let endDate: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  let allDay = true;

  if (first) {
    remainder = `${text.slice(0, first.index)}${text.slice(first.index + first.text.length)}`;
    const start = first.start.date();
    startDate = toDateKey(start);
    if (hasClock(start, first.start.isCertain("hour") ? { hour: true } : undefined) && first.start.isCertain("hour")) {
      startTime = toTimeKey(start);
      allDay = false;
    }
    if (first.end) {
      const end = first.end.date();
      endDate = toDateKey(end);
      if (first.end.isCertain("hour")) {
        endTime = toTimeKey(end);
        allDay = false;
      }
    }
  }

  const personIds: string[] = [];
  const sortedPeople = [...people].sort((a, b) => b.displayName.length - a.displayName.length);
  for (const person of sortedPeople) {
    const name = person.displayName.trim();
    if (name.length < 2) continue;
    const firstName = name.split(/\s+/)[0] ?? name;
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b|\\b${escapeRegExp(firstName)}\\b`, "i");
    if (pattern.test(remainder) || pattern.test(text)) {
      personIds.push(person.id);
      remainder = remainder.replace(pattern, " ");
    }
  }

  let locationText: string | null = null;
  let locationId: string | null = null;
  const myPlace = /\b(my place|my apartment|my house|at mine)\b/i.exec(text);
  if (myPlace && input.viewerId) {
    locationText = "My Place";
    const home = places.find((place) => place.residentUserIds?.includes(input.viewerId!));
    if (home) locationId = home.id;
    remainder = remainder.replace(myPlace[0], " ");
  } else {
    const atMatch = /\bat\s+(.+)$/i.exec(remainder) ?? /\bat\s+([^,]+)/i.exec(text);
    if (atMatch) {
      const phrase = atMatch[1].replace(/\bwith\b[\s\S]*$/i, "").trim();
      const place = places.find(
        (item) =>
          item.name.toLowerCase() === phrase.toLowerCase() ||
          phrase.toLowerCase().includes(item.name.toLowerCase()),
      );
      if (place) {
        locationId = place.id;
        locationText = place.name;
      } else if (phrase) {
        locationText = phrase.replace(/\b(friday|saturday|sunday|monday|tuesday|wednesday|thursday|tonight|today|tomorrow).*$/i, "").trim() || phrase;
      }
      remainder = remainder.replace(atMatch[0], " ");
    }
  }

  remainder = remainder
    .replace(/\bwith\b/gi, " ")
    .replace(/\bto\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.\-–—]+|[,.\-–—]+$/g, "")
    .trim();

  const title = remainder || text;
  const proposalType = SLEEPING_RE.test(text) ? "sleeping" : null;

  const chips: EventIntentChip[] = [];
  if (title) chips.push({ kind: "title", label: title });
  if (startDate) {
    const dateLabel =
      endDate && endDate !== startDate ? `${startDate} → ${endDate}` : startDate;
    chips.push({ kind: "date", label: dateLabel });
  }
  if (startTime) {
    chips.push({
      kind: "time",
      label: endTime && endTime !== startTime ? `${startTime}–${endTime}` : startTime,
    });
  }
  if (locationText) chips.push({ kind: "location", label: locationText });

  return {
    title,
    startDate,
    endDate,
    startTime,
    endTime,
    allDay,
    locationText,
    locationId,
    personIds,
    proposalType,
    chips,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
