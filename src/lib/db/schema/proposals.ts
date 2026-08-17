import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import {
  eventPrivacyLevels,
  inviteeRoles,
  inviteeVoteStatuses,
  proposalStates,
  proposalTypes,
} from "./enums";
import { users } from "./identity";
import { networks } from "./networks";
import { locations } from "./places";
import { storedImages } from "./feed";

/**
 * Proposal records for Kanban workflow (PC-40).
 */
export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  networkId: text("network_id").references(() => networks.id),
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
  /**
   * How this row was archived: user cancel vs auto-archive (PC-410).
   * `cancelled` is excluded from the PolyCal schedule; `auto` stays visible and keeps GCal.
   */
  archiveKind: text("archive_kind", { enum: ["cancelled", "auto"] }),
  /** When true, lifecycle milestones appear on the network Feed (PC-414). Default off for new drafts. */
  postToFeed: integer("post_to_feed", { mode: "boolean" }).notNull().default(false),
  /**
   * Proposal uses the vote workflow; schedule auto-resolves onto the calendar (PC-424).
   */
  postingKind: text("posting_kind").notNull().default("proposal"),
  /** Subject when Proxy Scheduling posts on behalf of someone else (PC-425). */
  onBehalfOfUserId: text("on_behalf_of_user_id").references(() => users.id),
  /** Parent proposal when this row was detached from a batch night or span day slice. */
  detachedFromParentId: text("detached_from_parent_id"),
  detachedFromSlotId: text("detached_from_slot_id"),
  detachedAt: text("detached_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  // Board columns, enforcement sweeps, schedule ranges, and recurrence children (PC-355).
  index("idx_proposals_state").on(table.state),
  index("idx_proposals_state_scheduled_start").on(table.state, table.scheduledStartAt),
  index("idx_proposals_proposer_state").on(table.proposerId, table.state),
  index("idx_proposals_parent").on(table.parentProposalId),
]);

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
  (table) => [
    unique().on(table.proposalId, table.userId),
    // Reverse lookup: which proposals a viewer is invited to (PC-355).
    index("idx_proposal_invitees_user").on(table.userId),
  ],
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
}, (table) => [
  // Batched slot loads by proposal + calendar range scans (PC-355).
  index("idx_proposal_time_slots_proposal").on(table.proposalId),
  index("idx_proposal_time_slots_start_end").on(table.startAt, table.endAt),
]);

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

/** Proposal state transition audit trail (PC-40). Soft-delete hides from Feed (PC-365). */
export const proposalStateLog = sqliteTable("proposal_state_log", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id),
  actorUserId: text("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
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
