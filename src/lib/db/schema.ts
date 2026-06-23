import {
  blob,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Singleton poly-group metadata row (id must always be 1). */
export const polyGroup = sqliteTable("poly_group", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Physical or virtual places — foundation for People & Places tab. */
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
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

export const schema = {
  users,
  polyGroup,
  locations,
  userActivityLog,
  storedImages,
  schemaMeta,
};
