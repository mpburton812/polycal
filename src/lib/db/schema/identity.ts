import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import {
  userRoles,
  userStatuses,
  type UserRole,
  type UserStatus,
} from "@/types/user";

export { userRoles, userStatuses, type UserRole, type UserStatus };

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
  /** SHA-256 digest of the emailed verification token — never the raw value (PC-353). */
  emailVerificationToken: text("email_verification_token"),
  emailVerificationTokenExpiresAt: text("email_verification_token_expires_at"),
  /** SHA-256 digest of the emailed reset token — never the raw value (PC-353). */
  passwordResetToken: text("password_reset_token"),
  passwordResetTokenExpiresAt: text("password_reset_token_expires_at"),
  notificationPrefsJson: text("notification_prefs_json"),
  /** Account-persisted Feed Controls (Who/What filters) — PC-265. */
  feedPrefsJson: text("feed_prefs_json"),
  /** IANA timezone for schedule display normalization (PC-48 / PC-376). */
  timezone: text("timezone").notNull().default("America/New_York"),
  /** Optional blurb shown under the user's name on People & Places (PC-117). */
  profileBio: text("profile_bio"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(0),
  activatedFromPassiveAt: text("activated_from_passive_at"),
  /** Platform-wide operator — not a network membership role (PC-357). */
  isPlatformAdmin: integer("is_platform_admin", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Owning active user for passive/proxy profiles that travel across networks (PC-357). */
  ownedByUserId: text("owned_by_user_id"),
  /** Shown on the paused/banned screen when set by an administrator. */
  moderationReason: text("moderation_reason"),
  /** ISO timestamp — when set, shown on paused/banned screen and auto-clears on login after. */
  moderationExpiresAt: text("moderation_expires_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** @deprecated Legacy singleton settings table — app reads from `networks` only. */
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
  /**
   * When true, members see sleeping nights where an accepted partner is involved
   * and they themselves are not (lighter purple on schedule) (PC-366).
   */
  seePartnersSleepingArrangements: integer("see_partners_sleeping_arrangements", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  /** When false, FastSleep proposal entry and create action are disabled (PC-378). Default ON. */
  fastSleepEnabled: integer("fast_sleep_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  /** When false, Feed tab and feed actions are disabled (PC-385). Default ON. */
  feedEnabled: integer("feed_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
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
