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
  theme: text("theme").notNull().default("sage"),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: text("last_login_at"),
  gender: text("gender"),
  notificationEmail: text("notification_email"),
  /** E.164-ish mobile for optional SMS alerts (PC-494). */
  notificationPhone: text("notification_phone"),
  emailVerifiedAt: text("email_verified_at"),
  /** SHA-256 digest of the emailed verification token — never the raw value (PC-353). */
  emailVerificationToken: text("email_verification_token"),
  emailVerificationTokenExpiresAt: text("email_verification_token_expires_at"),
  /** SHA-256 digest of the emailed reset token — never the raw value (PC-353). */
  passwordResetToken: text("password_reset_token"),
  passwordResetTokenExpiresAt: text("password_reset_token_expires_at"),
  /** SHA-256 digest of the emailed login link — never the raw value (PC-465). */
  emailLoginToken: text("email_login_token"),
  emailLoginTokenExpiresAt: text("email_login_token_expires_at"),
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

/** @deprecated Physical poly_group rows may still exist. The app reads networks only (PC-537). */
