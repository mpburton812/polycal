/**
 * Calendar integration types (PC-337 / Option B).
 */

export const calendarProviders = ["google", "ics"] as const;
export type CalendarProvider = (typeof calendarProviders)[number];

export const icsDeliveryModes = ["download", "email", "both"] as const;
export type IcsDeliveryMode = (typeof icsDeliveryModes)[number];

export const calendarConnectionStatuses = ["active", "needs_reconnect"] as const;
export type CalendarConnectionStatus = (typeof calendarConnectionStatuses)[number];

export const icsMethods = ["PUBLISH", "REQUEST", "CANCEL"] as const;
export type IcsMethod = (typeof icsMethods)[number];

export type CalendarSyncAction = "upsert" | "delete";

/** CSRF state cookie for Google Calendar OAuth connect (not a server-action export). */
export const GOOGLE_OAUTH_STATE_COOKIE = "polycal_gcal_oauth_state";
