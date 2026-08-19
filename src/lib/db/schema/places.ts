import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import {
  partnershipStatuses,
  placeRoles,
  residencyStatuses,
  type PartnershipStatus,
  type PlaceRole,
  type ResidencyStatus,
} from "@/types/relationship";

import { users } from "./identity";
import { networks } from "./networks";
import { proposals } from "./proposals";

export {
  partnershipStatuses,
  placeRoles,
  residencyStatuses,
  type PartnershipStatus,
  type PlaceRole,
  type ResidencyStatus,
};

/** Physical or virtual places — foundation for People & Places tab. */
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  networkId: text("network_id").references(() => networks.id),
  name: text("name").notNull(),
  description: text("description"),
  address: text("address"),
  bedroomCount: integer("bedroom_count").notNull().default(0),
  /** JSON string array of bedroom labels. */
  bedroomNames: text("bedroom_names"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_locations_network").on(table.networkId),
]);

/** Undirected sleeping partnership edge with proposal workflow (PC-36). */
export const sleepingPartnerships = sqliteTable("sleeping_partnerships", {
  id: text("id").primaryKey(),
  networkId: text("network_id").references(() => networks.id),
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
}, (table) => [
  // Undirected edge lookups by status for both endpoints (PC-355).
  index("idx_sleeping_partnerships_status").on(table.status),
  index("idx_sleeping_partnerships_low_status").on(table.userLowId, table.status),
  index("idx_sleeping_partnerships_high_status").on(table.userHighId, table.status),
  index("idx_sleeping_partnerships_network_status").on(table.networkId, table.status),
]);

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
}, (table) => [
  // Eligible-location and residency-approval filters (PC-355).
  index("idx_location_residents_user_status").on(table.userId, table.status),
  index("idx_location_residents_location_status").on(table.locationId, table.status),
]);
