import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { users } from "./identity";
import { proposals } from "./proposals";

/**
 * Per-user external calendar connection (Google OAuth or iCal/ICS prefs) — PC-338.
 */
export const calendarConnections = sqliteTable(
  "calendar_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id)
      .unique(),
    provider: text("provider", { enum: ["google", "ics"] }).notNull(),
    googleRefreshTokenEnc: text("google_refresh_token_enc"),
    googleAccessTokenEnc: text("google_access_token_enc"),
    googleTokenExpiresAt: text("google_token_expires_at"),
    googleCalendarId: text("google_calendar_id"),
    googleAccountEmail: text("google_account_email"),
    icsDelivery: text("ics_delivery", { enum: ["download", "email", "both"] }),
    status: text("status", { enum: ["active", "needs_reconnect"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

/** Maps a PolyCal proposal to an external calendar event per user (+ night) — PC-338 / PC-351. */
export const calendarEventLinks = sqliteTable(
  "calendar_event_links",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id),
    provider: text("provider", { enum: ["google", "ics"] }).notNull(),
    googleEventId: text("google_event_id"),
    googleCalendarId: text("google_calendar_id"),
    icsUid: text("ics_uid"),
    icsSequence: integer("ics_sequence").notNull().default(0),
    /** Empty for single-span events; YYYY-MM-DD for each batch night (PC-351). */
    nightKey: text("night_key").notNull().default(""),
    lastSyncedAt: text("last_synced_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [unique().on(table.userId, table.proposalId, table.nightKey)],
);

/** Queued ICS downloads when email is unavailable or Both is selected — PC-340. */
export const calendarIcsPending = sqliteTable("calendar_ics_pending", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id),
  icsUid: text("ics_uid").notNull(),
  icsSequence: integer("ics_sequence").notNull().default(0),
  method: text("method").notNull(),
  filename: text("filename").notNull(),
  icsBody: text("ics_body").notNull(),
  title: text("title").notNull(),
  dismissedAt: text("dismissed_at"),
  downloadedAt: text("downloaded_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
