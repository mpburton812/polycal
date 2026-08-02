import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { users } from "./identity";
import { networks } from "./networks";

/**
 * Append-only user action log required by spec §1 — every user action is recorded.
 */
export const userActivityLog = sqliteTable("user_activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id),
  networkId: text("network_id").references(() => networks.id),
  action: text("action").notNull(),
  details: text("details"),
  eventType: text("event_type").notNull().default("user"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  // Notification inbox reads: per-user system rows ordered by recency (PC-355).
  index("idx_user_activity_log_user_event_created").on(
    table.userId,
    table.eventType,
    table.createdAt,
  ),
]);

/** Tracks per-user dismissal of system notifications in the activity log (PC-40). */
export const notificationDismissals = sqliteTable(
  "notification_dismissals",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    logId: integer("log_id")
      .notNull()
      .references(() => userActivityLog.id),
    dismissedAt: text("dismissed_at").notNull(),
  },
  (table) => [unique().on(table.userId, table.logId)],
);

/** Web Push subscription endpoints per user device (PC-43 Phase 5). */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);
