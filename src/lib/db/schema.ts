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
  residencyStatuses,
  type PartnershipStatus,
  type ResidencyStatus,
} from "@/types/relationship";

export { userRoles, userStatuses, type UserRole, type UserStatus };
export { partnershipStatuses, residencyStatuses, type PartnershipStatus, type ResidencyStatus };

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
  notificationPrefsJson: text("notification_prefs_json"),
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
  allowGroupNameProposals: integer("allow_group_name_proposals", { mode: "boolean" })
    .notNull()
    .default(false),
  groupNameChangeMode: text("group_name_change_mode").notNull().default("admin_only"),
  powerManagementMode: text("power_management_mode").notNull().default("admin_user"),
  roleSnapshotsJson: text("role_snapshots_json"),
  eventPrivacyOpen: integer("event_privacy_open", { mode: "boolean" }).notNull().default(true),
  eventPrivacyPrivate: integer("event_privacy_private", { mode: "boolean" }).notNull().default(true),
  eventPrivacySuperPrivate: integer("event_privacy_super_private", { mode: "boolean" })
    .notNull()
    .default(true),
  adminCanSeePrivate: integer("admin_can_see_private", { mode: "boolean" }).notNull().default(false),
  adminCanSeeSuperPrivate: integer("admin_can_see_super_private", { mode: "boolean" })
    .notNull()
    .default(false),
  auditLogVisibility: text("audit_log_visibility").notNull().default("admin_only"),
  hideSleepingArrangements: integer("hide_sleeping_arrangements", { mode: "boolean" })
    .notNull()
    .default(false),
  logTailLength: integer("log_tail_length").notNull().default(100),
  onboardingWelcomeMessage: text("onboarding_welcome_message"),
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

export const eventPrivacyLevels = ["open", "private", "super_private"] as const;
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
  atRisk: integer("at_risk", { mode: "boolean" }).notNull().default(false),
  atRiskExpiresAt: text("at_risk_expires_at"),
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
  winningSlotId: text("winning_slot_id"),
  notes: text("notes"),
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
  createdAt: text("created_at").notNull(),
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
  proposedById: text("proposed_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  respondedAt: text("responded_at"),
});

export const schema = {
  users,
  polyGroup,
  locations,
  userActivityLog,
  storedImages,
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
};
