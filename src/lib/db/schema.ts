import {
  blob,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import {
  userRoles,
  userStatuses,
  type UserRole,
  type UserStatus,
} from "@/types/user";
import {
  partnershipStatuses,
  placeRoles,
  residencyStatuses,
  type PartnershipStatus,
  type PlaceRole,
  type ResidencyStatus,
} from "@/types/relationship";

export { userRoles, userStatuses, type UserRole, type UserStatus };
export {
  partnershipStatuses,
  placeRoles,
  residencyStatuses,
  type PartnershipStatus,
  type PlaceRole,
  type ResidencyStatus,
};

/**
 * Core identity table — credentials auth with bcrypt hashes; no PII in JSON blobs.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: userRoles }).notNull().default("user"),
  status: text("status", { enum: userStatuses }).notNull().default("active"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
  avatarKey: text("avatar_key"),
  theme: text("theme").notNull().default("mint"),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: text("last_login_at"),
  gender: text("gender"),
  notificationEmail: text("notification_email"),
  emailVerifiedAt: text("email_verified_at"),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationTokenExpiresAt: text("email_verification_token_expires_at"),
  passwordResetToken: text("password_reset_token"),
  passwordResetTokenExpiresAt: text("password_reset_token_expires_at"),
  notificationPrefsJson: text("notification_prefs_json"),
  /** Account-persisted Feed Controls (Who/What filters) — PC-265. */
  feedPrefsJson: text("feed_prefs_json"),
  /** IANA timezone for schedule display normalization (PC-48 / spec §10). */
  timezone: text("timezone").notNull().default("UTC"),
  /** Optional blurb shown under the user's name on People & Places (PC-117). */
  profileBio: text("profile_bio"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(0),
  activatedFromPassiveAt: text("activated_from_passive_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Singleton poly-group metadata row (id must always be 1). */
export const polyGroup = sqliteTable("poly_group", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  allowUserProvisioning: integer("allow_user_provisioning", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * Retired columns (PC-280 / PC-332): group name proposals, power management ("all
   * admin"), per-level event privacy toggles, and sleeping network visibility were
   * removed from the app and are no longer modeled here. The underlying SQLite columns
   * may still exist on legacy DBs (SQLite ALTER TABLE DROP COLUMN is intentionally not
   * run); they are simply not ensured and not read by the app.
   */
  /**
   * When true, admins see proposals they are not proposer/invitee for (PC-274).
   * Peach oversight chrome still applies for those uninvolved views.
   */
  adminCanSeeUninvolved: integer("admin_can_see_uninvolved", { mode: "boolean" })
    .notNull()
    .default(true),
  auditLogVisibility: text("audit_log_visibility").notNull().default("admin_only"),
  hideSleepingArrangements: integer("hide_sleeping_arrangements", { mode: "boolean" })
    .notNull()
    .default(false),
  placesMapVisibility: text("places_map_visibility").notNull().default("all"),
  logTailLength: integer("log_tail_length").notNull().default(100),
  onboardingWelcomeMessage: text("onboarding_welcome_message"),
  /** Days in proposed before auto-expire; 0 = expire only when event start passes (PC-273). */
  proposedMaxDays: integer("proposed_max_days").notNull().default(0),
  /** Days an at-risk draft stays editable before archive (PC-273). */
  atRiskTtlDays: integer("at_risk_ttl_days").notNull().default(7),
  archiveGraceHours: integer("archive_grace_hours").notNull().default(24),
  redraftDeadlineHours: integer("redraft_deadline_hours").notNull().default(24),
  /**
   * Days a pending sleeping-partnership proposal may sit unanswered before
   * auto-delete + notify proposer and invitee (PC-273).
   */
  sleepingPartnerProposalMaxDays: integer("sleeping_partner_proposal_max_days")
    .notNull()
    .default(5),
  updatedAt: text("updated_at").notNull(),
});

/** Physical or virtual places — foundation for People & Places tab. */
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  address: text("address"),
  bedroomCount: integer("bedroom_count").notNull().default(0),
  /** JSON string array of bedroom labels. */
  bedroomNames: text("bedroom_names"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Append-only user action log required by spec §1 — every user action is recorded.
 */
export const userActivityLog = sqliteTable("user_activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  details: text("details"),
  eventType: text("event_type").notNull().default("user"),
  createdAt: text("created_at").notNull(),
});

/** Runtime image storage in Turso BLOB column per architecture decision. */
export const storedImages = sqliteTable("stored_images", {
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const alphaFeedbackKinds = ["bug", "feature"] as const;
export type AlphaFeedbackKind = (typeof alphaFeedbackKinds)[number];

export const alphaFeedbackStatuses = [
  "not_started",
  "in_progress",
  "ready_for_testing",
  "deferred",
  "working_as_designed",
  "closed",
] as const;
export type AlphaFeedbackStatus = (typeof alphaFeedbackStatuses)[number];

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

/** Tracks schema version for idempotent bootstrap migrations. */
export const schemaMeta = sqliteTable("schema_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const proposalStates = ["draft", "proposed", "resolved", "archived"] as const;
export type ProposalState = (typeof proposalStates)[number];

export const proposalTypes = ["event", "sleeping"] as const;
export type ProposalType = (typeof proposalTypes)[number];

export const inviteeRoles = ["required", "optional"] as const;
export type InviteeRole = (typeof inviteeRoles)[number];

export const inviteeVoteStatuses = [
  "not_seen",
  "accept",
  "abstain",
  "decline",
  "accept_suboptimal",
] as const;
export type InviteeVoteStatus = (typeof inviteeVoteStatuses)[number];

/** Privacy levels were removed (PC-280) — every proposal is "open"; column kept for migration backfill. */
export const eventPrivacyLevels = ["open"] as const;
export type EventPrivacyLevel = (typeof eventPrivacyLevels)[number];

/**
 * Proposal records for Kanban workflow (PC-40).
 */
export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  proposalType: text("proposal_type", { enum: proposalTypes }).notNull(),
  state: text("state", { enum: proposalStates }).notNull(),
  proposerId: text("proposer_id")
    .notNull()
    .references(() => users.id),
  locationId: text("location_id").references(() => locations.id),
  /** Free-text location when no registered place is selected (PC-43). */
  locationText: text("location_text"),
  scheduledStartAt: text("scheduled_start_at"),
  scheduledEndAt: text("scheduled_end_at"),
  intentionalSolo: integer("intentional_solo", { mode: "boolean" }).notNull().default(false),
  eventPrivacy: text("event_privacy", { enum: eventPrivacyLevels }).notNull().default("open"),
  isPoll: integer("is_poll", { mode: "boolean" }).notNull().default(false),
  /** All-day event — start/end represent whole calendar days, no clock time (PC). */
  isAllDay: integer("is_all_day", { mode: "boolean" }).notNull().default(false),
  atRisk: integer("at_risk", { mode: "boolean" }).notNull().default(false),
  atRiskExpiresAt: text("at_risk_expires_at"),
  /** When set on resolved proposals, calendar hold until invitees/solo are restored (PC-53). */
  pendingRecoveryUntil: text("pending_recovery_until"),
  parentProposalId: text("parent_proposal_id"),
  /** JSON recurrence pattern: daily|weekly|monthly|yearly, interval, count (2–52). */
  recurrenceRule: text("recurrence_rule"),
  occurrenceIndex: integer("occurrence_index"),
  isRecurrenceParent: integer("is_recurrence_parent", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Place bedroom index for sleeping proposals (MVP place-level lock when unset). */
  bedroomIndex: integer("bedroom_index"),
  batchGroupId: text("batch_group_id"),
  /** Single batch sleeping proposal with embedded mini-proposals (JSON array). */
  isBatchSleeping: integer("is_batch_sleeping", { mode: "boolean" })
    .notNull()
    .default(false),
  batchEntriesJson: text("batch_entries_json"),
  winningSlotId: text("winning_slot_id"),
  notes: text("notes"),
  /** Minutes before event start to notify invitees (PC-65). */
  reminderOffsetMinutes: integer("reminder_offset_minutes"),
  /** ISO timestamp when reminder notifications were sent (PC-65). */
  reminderSentAt: text("reminder_sent_at"),
  /** Last manual nudge to pending voters (PC-293). */
  lastNudgeAt: text("last_nudge_at"),
  /** Optional category icon key for social events (PC-116). */
  eventIconKey: text("event_icon_key"),
  /** Parent proposal when this row was detached from a batch night or span day slice. */
  detachedFromParentId: text("detached_from_parent_id"),
  detachedFromSlotId: text("detached_from_slot_id"),
  detachedAt: text("detached_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Users invited to a proposal — voting queue and notifications (PC-40). */
export const proposalInvitees = sqliteTable(
  "proposal_invitees",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: inviteeRoles }).notNull().default("required"),
    voteStatus: text("vote_status", { enum: inviteeVoteStatuses })
      .notNull()
      .default("not_seen"),
    respondedAt: text("responded_at"),
    /** ISO timestamp when invitee first opened proposal detail (PC-76). */
    viewedAt: text("viewed_at"),
    overlapAcknowledgedAt: text("overlap_acknowledged_at"),
    /** User who added this invitee — casts proxy votes for passive profiles (PC-246). */
    addedByUserId: text("added_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.proposalId, table.userId)],
);

/** Poll or single-slot scheduling options attached to a draft/proposed item. */
export const proposalTimeSlots = sqliteTable("proposal_time_slots", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id),
  startAt: text("start_at").notNull(),
  endAt: text("end_at"),
  label: text("label"),
  sortOrder: integer("sort_order").notNull().default(0),
  /** All-day slot — start/end represent whole calendar days, no clock time (PC). */
  isAllDay: integer("is_all_day", { mode: "boolean" }).notNull().default(false),
  /** Tombstoned when a batch night or span day was detached into its own proposal. */
  isDetached: integer("is_detached", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

/** Per-slot poll votes — matrix voting for multi-slot polls (PC-40). */
export const proposalSlotVotes = sqliteTable(
  "proposal_slot_votes",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id),
    timeSlotId: text("time_slot_id")
      .notNull()
      .references(() => proposalTimeSlots.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    voteStatus: text("vote_status", { enum: inviteeVoteStatuses })
      .notNull()
      .default("not_seen"),
    respondedAt: text("responded_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.timeSlotId, table.userId)],
);

/** Immutable proposal state transition audit trail (PC-40). */
export const proposalStateLog = sqliteTable("proposal_state_log", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id),
  actorUserId: text("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: text("created_at").notNull(),
});

/** Threaded discussion on a proposal (PC-40). */
export const proposalComments = sqliteTable("proposal_comments", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  /** Optional slice tag for night/day-scoped comments on parent threads (e.g. slot:id, day:yyyy-MM-dd). */
  sliceTag: text("slice_tag"),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  /** Cached Open Graph preview for the first URL in body (PC-279). */
  linkPreviewId: text("link_preview_id"),
});

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

/** Undirected sleeping partnership edge with proposal workflow (PC-36). */
export const sleepingPartnerships = sqliteTable("sleeping_partnerships", {
  id: text("id").primaryKey(),
  userLowId: text("user_low_id")
    .notNull()
    .references(() => users.id),
  userHighId: text("user_high_id")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: partnershipStatuses }).notNull(),
  proposedById: text("proposed_by_id")
    .notNull()
    .references(() => users.id),
  /** Admin or proxy user who submitted on behalf of proposedById (PC-50). */
  initiatedByUserId: text("initiated_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  respondedAt: text("responded_at"),
  passiveAutoAccepted: integer("passive_auto_accepted", { mode: "boolean" })
    .notNull()
    .default(false),
});

/** User residency at a place — active users must accept (PC-37). */
export const locationResidents = sqliteTable("location_residents", {
  id: text("id").primaryKey(),
  locationId: text("location_id")
    .notNull()
    .references(() => locations.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: residencyStatuses }).notNull(),
  /** Owner can add members immediately; owners approve self-join proposals. */
  placeRole: text("place_role", { enum: placeRoles }).notNull().default("resident"),
  proposedById: text("proposed_by_id")
    .notNull()
    .references(() => users.id),
  /** Backing proposal when residency uses standard draft workflow (PC-60). */
  proposalId: text("proposal_id").references(() => proposals.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  respondedAt: text("responded_at"),
});

/** Network-wide chat messages on the Feed tab (PC-228). */
export const networkChatMessages = sqliteTable("network_chat_messages", {
  id: text("id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  /** Cached Open Graph preview for the first URL in body (PC-279). */
  linkPreviewId: text("link_preview_id"),
});

/** Threaded replies on network chat messages (PC-234). */
export const networkChatComments = sqliteTable("network_chat_comments", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => networkChatMessages.id),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  /** Cached Open Graph preview for the first URL in body (PC-279). */
  linkPreviewId: text("link_preview_id"),
});

export const networkChatMessageImages = sqliteTable("network_chat_message_images", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => networkChatMessages.id),
  imageId: text("image_id")
    .notNull()
    .references(() => storedImages.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const networkChatCommentImages = sqliteTable("network_chat_comment_images", {
  id: text("id").primaryKey(),
  commentId: text("comment_id")
    .notNull()
    .references(() => networkChatComments.id),
  imageId: text("image_id")
    .notNull()
    .references(() => storedImages.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Shared Open Graph / link-preview cache for Feed posts (PC-279). */
export const feedLinkPreviews = sqliteTable("feed_link_previews", {
  id: text("id").primaryKey(),
  normalizedUrl: text("normalized_url").notNull().unique(),
  canonicalUrl: text("canonical_url").notNull(),
  title: text("title"),
  description: text("description"),
  imageUrl: text("image_url"),
  siteName: text("site_name"),
  /** ok | failed */
  status: text("status").notNull().default("ok"),
  fetchedAt: text("fetched_at").notNull(),
  errorCode: text("error_code"),
});

export const proposalCommentImages = sqliteTable("proposal_comment_images", {
  id: text("id").primaryKey(),
  commentId: text("comment_id")
    .notNull()
    .references(() => proposalComments.id),
  imageId: text("image_id")
    .notNull()
    .references(() => storedImages.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Tracks pending feed image uploads before attach to a message/comment (PC-236). */
export const feedImageUploads = sqliteTable("feed_image_uploads", {
  imageId: text("image_id")
    .primaryKey()
    .references(() => storedImages.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

/** Likes on feed milestones, chats, and comments (PC-239). */
export const feedLikeTargetTypes = [
  "milestone",
  "chat",
  "chat_comment",
  "proposal_comment",
] as const;
export type FeedLikeTargetType = (typeof feedLikeTargetTypes)[number];

export const feedLikes = sqliteTable(
  "feed_likes",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.targetType, table.targetId, table.userId)],
);

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

export const schema = {
  users,
  polyGroup,
  locations,
  userActivityLog,
  storedImages,
  alphaFeedbackSubmissions,
  schemaMeta,
  proposals,
  proposalInvitees,
  proposalSlotVotes,
  proposalTimeSlots,
  proposalStateLog,
  proposalComments,
  notificationDismissals,
  pushSubscriptions,
  sleepingPartnerships,
  locationResidents,
  networkChatMessages,
  networkChatComments,
  networkChatMessageImages,
  networkChatCommentImages,
  proposalCommentImages,
  feedImageUploads,
  feedLikes,
  feedLinkPreviews,
  calendarConnections,
  calendarEventLinks,
  calendarIcsPending,
};
