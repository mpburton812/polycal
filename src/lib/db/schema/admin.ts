import { blob, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { users } from "./identity";
import { networks } from "./networks";

/**
 * Alpha tester bug/feature submissions with silent diagnostics + screenshot (PC-119).
 */
export const alphaFeedbackSubmissions = sqliteTable("alpha_feedback_submissions", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("not_started"),
  /**
   * Stable human-visible ticket number (#N). Assigned once at insert; never reused (PC-222).
   */
  ticketNumber: integer("ticket_number"),
  submitterUserId: text("submitter_user_id")
    .notNull()
    .references(() => users.id),
  submitterDisplayName: text("submitter_display_name").notNull(),
  submittedAt: text("submitted_at").notNull(),
  environment: text("environment"),
  buildSha: text("build_sha"),
  buildBranch: text("build_branch"),
  pagePath: text("page_path"),
  viewportWidth: integer("viewport_width"),
  viewportHeight: integer("viewport_height"),
  userAgent: text("user_agent"),
  osLabel: text("os_label"),
  consoleLogTail: text("console_log_tail"),
  screenshotMimeType: text("screenshot_mime_type"),
  screenshotData: blob("screenshot_data", { mode: "buffer" }),
  internalComment: text("internal_comment"),
  submitterComment: text("submitter_comment"),
  /**
   * JSON array of `{ at, internalComment?, submitterComment? }` triage notes (PC-182).
   */
  commentLog: text("comment_log"),
  /** ISO timestamp when archived; null means active inbox (PC-136). */
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Admin-broadcast Message of the Day (platform-wide or per network) — PC-392.
 * At most one active row per scope is enforced in publish actions.
 */
export const motdMessages = sqliteTable(
  "motd_messages",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(), // platform | network
    networkId: text("network_id").references(() => networks.id),
    body: text("body").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    endsAt: text("ends_at"),
    status: text("status").notNull().default("active"), // active | cleared | expired
  },
  (table) => [
    index("idx_motd_messages_scope_status").on(table.scope, table.status),
    index("idx_motd_messages_network_status").on(table.networkId, table.status),
  ],
);

/** Per-user dismiss-once acknowledgments for MOTD pop-ups — PC-392. */
export const motdAcknowledgments = sqliteTable(
  "motd_acknowledgments",
  {
    motdId: text("motd_id")
      .notNull()
      .references(() => motdMessages.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    acknowledgedAt: text("acknowledged_at").notNull(),
  },
  (table) => [unique().on(table.motdId, table.userId)],
);
