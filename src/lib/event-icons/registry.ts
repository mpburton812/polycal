/**
 * Canonical event category icons — one optional key per event proposal (PC-116).
 */
export const EVENT_ICON_KEYS = [
  "food_pizza",
  "date_hearts",
  "karaoke_mic",
  "gaming_meeple",
  "bar_beer",
  "outdoors_tree",
  "sexy_flame",
  "sports_volleyball",
  "movie_popcorn",
  "party_hat",
] as const;

export type EventIconKey = (typeof EVENT_ICON_KEYS)[number];

export interface EventIconDefinition {
  key: EventIconKey;
  /** Short picker label shown in the draft dialog. */
  label: string;
  /** Screen-reader label for calendar watermarks and cards. */
  a11yLabel: string;
}

export const EVENT_ICON_REGISTRY: readonly EventIconDefinition[] = [
  { key: "food_pizza", label: "Food & Pizza", a11yLabel: "Food and pizza event" },
  { key: "date_hearts", label: "Date Night", a11yLabel: "Date night event" },
  { key: "karaoke_mic", label: "Karaoke", a11yLabel: "Karaoke event" },
  { key: "gaming_meeple", label: "Gaming", a11yLabel: "Gaming event" },
  { key: "bar_beer", label: "Drinks", a11yLabel: "Drinks event" },
  { key: "outdoors_tree", label: "Outdoors", a11yLabel: "Outdoors event" },
  { key: "sexy_flame", label: "Sexy Times", a11yLabel: "Sexy times event" },
  { key: "sports_volleyball", label: "Sports", a11yLabel: "Sports event" },
  { key: "movie_popcorn", label: "Movies", a11yLabel: "Movies event" },
  { key: "party_hat", label: "Party", a11yLabel: "Party event" },
] as const;

const registryByKey = new Map(EVENT_ICON_REGISTRY.map((entry) => [entry.key, entry]));

/** Returns registry metadata when key is valid; otherwise undefined. */
export function getEventIconDefinition(key: string | null | undefined): EventIconDefinition | undefined {
  if (!key) return undefined;
  return registryByKey.get(key as EventIconKey);
}

/** Type guard used by Zod and server actions before persisting icon keys. */
export function isEventIconKey(value: string | null | undefined): value is EventIconKey {
  return Boolean(value && registryByKey.has(value as EventIconKey));
}
