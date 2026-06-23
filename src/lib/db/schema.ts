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

/**
 * Proposal records for Kanban — full workflow logic arrives in later phases.
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
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

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
  sleepingPartnerships,
  locationResidents,
};
