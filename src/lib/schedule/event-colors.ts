/**
 * User-chosen fills for social events (PC-527).
 * Red/coral and purple/lavender stay reserved for conflict and sleeping.
 */

export const EVENT_SCHEDULE_COLOR_KEYS = [
  "sage",
  "sky",
  "teal",
  "slate",
  "olive",
  "sand",
] as const;

export type EventScheduleColorKey = (typeof EVENT_SCHEDULE_COLOR_KEYS)[number];

export interface EventScheduleColor {
  key: EventScheduleColorKey;
  label: string;
  fill: string;
  text: string;
  /** Closest Google Calendar event colorId (1–11), excluding red and purple ids. */
  googleColorId: string;
}

export const EVENT_SCHEDULE_COLORS: Record<EventScheduleColorKey, EventScheduleColor> = {
  sage: { key: "sage", label: "Sage", fill: "#A8C5A0", text: "#1E3A24", googleColorId: "2" },
  sky: { key: "sky", label: "Sky", fill: "#9ECAE1", text: "#16384A", googleColorId: "7" },
  teal: { key: "teal", label: "Teal", fill: "#7EB8B0", text: "#143532", googleColorId: "10" },
  slate: { key: "slate", label: "Slate", fill: "#8FA4C4", text: "#1C2A44", googleColorId: "9" },
  olive: { key: "olive", label: "Olive", fill: "#B7C48A", text: "#2C3814", googleColorId: "10" },
  sand: { key: "sand", label: "Sand", fill: "#E4D5B7", text: "#3D3424", googleColorId: "8" },
};

export function isEventScheduleColor(value: string | null | undefined): value is EventScheduleColorKey {
  return EVENT_SCHEDULE_COLOR_KEYS.includes(value as EventScheduleColorKey);
}

export function eventScheduleColor(
  value: string | null | undefined,
): EventScheduleColor | null {
  return isEventScheduleColor(value) ? EVENT_SCHEDULE_COLORS[value] : null;
}

/** Google colorId for a stored key. Unknown keys omit color so Google keeps its default. */
export function googleColorIdForScheduleColor(
  value: string | null | undefined,
): string | undefined {
  return eventScheduleColor(value)?.googleColorId;
}
