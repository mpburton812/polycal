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
  sleeperUserId: string | null;
  hostUserId: string | null;
  intentionalSolo: boolean;
  needsBookingFor: boolean;
  chips: EventIntentChip[];
}

const SLEEPING_RE =
  /\b(overnight|sleep(?:s|ing)?|spend(?:ing)? the night|stay(?:s|ing)? at|night at)\b/i;
const ALONE_RE = /\b(alone|solo|by themselves|by themself|by himself|by herself)\b/i;
const WEEKEND_RE = /\b(?:this|the)\s+weekend\b/i;
const THEIR_PLACE_RE = /\bat\s+their\s+(?:place|house|apartment|home)\b/i;
const MY_PLACE_RE = /\b(my place|my apartment|my house|at mine)\b/i;
const SLEEPER_VERB_RE =
  /^(.+?)\s+(?:sleeps|is sleeping|sleeping|stays|is staying|stay(?:ing)? at|spend(?:ing)? the night)\b/i;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeKey(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Friday and Saturday nights of the current or upcoming weekend (PC-442).
 */
export function sleepingWeekendNights(now: Date): { startDate: string; endDate: string } {
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  const day = noon.getDay();
  const friday = new Date(noon);
  if (day === 0) {
    friday.setDate(noon.getDate() + 5);
  } else if (day <= 5) {
    friday.setDate(noon.getDate() + (5 - day));
  } else {
    friday.setDate(noon.getDate() - 1);
  }
  const saturday = addDays(friday, 1);
  return { startDate: toDateKey(friday), endDate: toDateKey(saturday) };
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

function personPattern(person: EventIntentPerson): RegExp {
  const name = person.displayName.trim();
  const first = firstName(name);
  return new RegExp(`\\b${escapeRegExp(name)}\\b|\\b${escapeRegExp(first)}\\b`, "i");
}

function findPerson(
  token: string,
  people: readonly EventIntentPerson[],
): EventIntentPerson | null {
  const needle = token.trim().toLowerCase();
  if (!needle) return null;
  const sorted = [...people].sort((a, b) => b.displayName.length - a.displayName.length);
  for (const person of sorted) {
    const name = person.displayName.trim().toLowerCase();
    const first = firstName(person.displayName).toLowerCase();
    if (needle === name || needle === first) return person;
  }
  return null;
}

function homeForUser(
  places: readonly EventIntentPlace[],
  userId: string | null | undefined,
): EventIntentPlace | null {
  if (!userId) return null;
  return places.find((place) => place.residentUserIds?.includes(userId)) ?? null;
}

function emptyResult(): EventIntentParseResult {
  return {
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
    sleeperUserId: null,
    hostUserId: null,
    intentionalSolo: false,
    needsBookingFor: false,
    chips: [],
  };
}

/**
 * Parses Fantastical-style event text into title, dates, times, people, and place.
 * Sleeping sentences extract sleeper vs host for Booking-for (PC-441 / PC-442).
 */
export function parseEventIntent(input: EventIntentParseInput): EventIntentParseResult {
  const text = input.text.trim();
  const now = input.now ?? new Date();
  const people = input.people ?? [];
  const places = input.places ?? [];
  if (!text) return emptyResult();

  const sleeping = SLEEPING_RE.test(text);
  const proposalType: "event" | "sleeping" = sleeping ? "sleeping" : "event";
  const intentionalSolo = ALONE_RE.test(text);

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
    if (
      hasClock(start, first.start.isCertain("hour") ? { hour: true } : undefined) &&
      first.start.isCertain("hour")
    ) {
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

  if (sleeping && WEEKEND_RE.test(text)) {
    const weekend = sleepingWeekendNights(now);
    startDate = weekend.startDate;
    endDate = weekend.endDate;
    startTime = null;
    endTime = null;
    allDay = true;
  }

  let sleeperUserId: string | null = sleeping ? (input.viewerId ?? null) : null;
  let hostUserId: string | null = null;
  const personIds: string[] = [];

  if (sleeping) {
    const sleeperMatch = SLEEPER_VERB_RE.exec(text);
    if (sleeperMatch) {
      const subject = findPerson(sleeperMatch[1] ?? "", people);
      if (subject) sleeperUserId = subject.id;
    }

    const possessive = /\bat\s+([A-Za-z][A-Za-z'-]*)(?:'s|s')(?:\s+(?:place|house|apartment|home))?\b/i.exec(
      text,
    );
    if (possessive) {
      const host = findPerson((possessive[1] ?? "").replace(/'s$/i, ""), people);
      if (host) hostUserId = host.id;
    }

    if (THEIR_PLACE_RE.test(text) && sleeperUserId) {
      hostUserId = sleeperUserId;
    }
  }

  const ownPlaceSolo =
    sleeping &&
    Boolean(sleeperUserId) &&
    (THEIR_PLACE_RE.test(text) || hostUserId === sleeperUserId) &&
    !/\bwith\b/i.test(text);
  const solo = intentionalSolo || ownPlaceSolo;

  const sortedPeople = [...people].sort((a, b) => b.displayName.length - a.displayName.length);
  for (const person of sortedPeople) {
    if (!personPattern(person).test(text)) continue;
    remainder = remainder.replace(personPattern(person), " ");
    if (sleeping) {
      if (person.id === sleeperUserId) continue;
      if (person.id === hostUserId && solo) continue;
      if (person.id === hostUserId || /\bwith\b/i.test(text)) {
        if (!personIds.includes(person.id)) personIds.push(person.id);
      }
    } else if (!personIds.includes(person.id)) {
      personIds.push(person.id);
    }
  }

  if (sleeping && hostUserId && !solo && hostUserId !== sleeperUserId) {
    if (!personIds.includes(hostUserId)) personIds.push(hostUserId);
  }

  let locationText: string | null = null;
  let locationId: string | null = null;
  const myPlace = MY_PLACE_RE.exec(text);
  if (myPlace && input.viewerId) {
    locationText = "My Place";
    const home = homeForUser(places, input.viewerId);
    if (home) locationId = home.id;
    remainder = remainder.replace(myPlace[0], " ");
  } else if (sleeping && (hostUserId || THEIR_PLACE_RE.test(text))) {
    const homeOwner = THEIR_PLACE_RE.test(text) ? sleeperUserId : hostUserId;
    const home = homeForUser(places, homeOwner);
    if (home) {
      locationId = home.id;
      locationText = home.name;
    } else if (homeOwner) {
      const owner = people.find((person) => person.id === homeOwner);
      locationText = owner ? `${firstName(owner.displayName)}'s place` : null;
    }
  } else {
    const atMatch = /\bat\s+(.+)$/i.exec(remainder) ?? /\bat\s+([^,]+)/i.exec(text);
    if (atMatch) {
      const phrase = atMatch[1]
        .replace(/\bwith\b[\s\S]*$/i, "")
        .replace(/\b(friday|saturday|sunday|monday|tuesday|wednesday|thursday|tonight|today|tomorrow|this weekend|the weekend|alone|solo).*$/i, "")
        .trim();
      const place = places.find(
        (item) =>
          item.name.toLowerCase() === phrase.toLowerCase() ||
          phrase.toLowerCase().includes(item.name.toLowerCase()),
      );
      if (place) {
        locationId = place.id;
        locationText = place.name;
      } else if (phrase) {
        locationText = phrase;
      }
      remainder = remainder.replace(atMatch[0], " ");
    }
  }

  remainder = remainder
    .replace(SLEEPING_RE, " ")
    .replace(ALONE_RE, " ")
    .replace(WEEKEND_RE, " ")
    .replace(THEIR_PLACE_RE, " ")
    .replace(/\bat\b/gi, " ")
    .replace(/\bwith\b/gi, " ")
    .replace(/\bto\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.\-–—]+|[,.\-–—]+$/g, "")
    .trim();

  const title = sleeping ? remainder : remainder || text;
  const needsBookingFor = Boolean(
    sleeping && sleeperUserId && input.viewerId && sleeperUserId !== input.viewerId,
  );

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
    sleeperUserId,
    hostUserId,
    intentionalSolo: solo,
    needsBookingFor,
    chips,
  };
}

function hasClock(date: Date, known: { hour?: boolean; minute?: boolean } | undefined): boolean {
  if (known?.hour || known?.minute) return true;
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
