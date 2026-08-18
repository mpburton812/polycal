import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import {
  networkMemberRoles,
  networkMemberStatuses,
  networkStatuses,
  type NetworkMemberRole,
  type NetworkMemberStatus,
  type NetworkStatus,
} from "@/types/network";

import { users } from "./identity";

export {
  networkMemberRoles,
  networkMemberStatuses,
  networkStatuses,
  type NetworkMemberRole,
  type NetworkMemberStatus,
  type NetworkStatus,
};

/**
 * Product tenant (PC-357) — settings and isolation boundary for scheduling data.
 */
export const networks = sqliteTable("networks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status", { enum: networkStatuses }).notNull().default("active"),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  createdByEmail: text("created_by_email"),
  allowUserProvisioning: integer("allow_user_provisioning", { mode: "boolean" })
    .notNull()
    .default(false),
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
  /** When false, Poll is omitted from new event drafts (PC-423). Default ON. */
  pollEnabled: integer("poll_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  /**
   * `proposals_only` hides Proposal vs Booking on the card.
   * `proposals_and_bookings` allows direct calendar posting (PC-428).
   */
  schedulingPosting: text("scheduling_posting")
    .notNull()
    .default("proposals_only"),
  /** Booking-for is always on under Proposals and Bookings (PC-428). Column kept. */
  proxySchedulingEnabled: integer("proxy_scheduling_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  /** `anyone` or `sleeping_partners` (PC-425). */
  proxySchedulingScope: text("proxy_scheduling_scope")
    .notNull()
    .default("sleeping_partners"),
  placesMapVisibility: text("places_map_visibility").notNull().default("all"),
  logTailLength: integer("log_tail_length").notNull().default(100),
  onboardingWelcomeMessage: text("onboarding_welcome_message"),
  proposedMaxDays: integer("proposed_max_days").notNull().default(0),
  atRiskTtlDays: integer("at_risk_ttl_days").notNull().default(7),
  archiveGraceHours: integer("archive_grace_hours").notNull().default(24),
  redraftDeadlineHours: integer("redraft_deadline_hours").notNull().default(24),
  sleepingPartnerProposalMaxDays: integer("sleeping_partner_proposal_max_days")
    .notNull()
    .default(5),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Membership of a platform user in a network (PC-357). */
export const networkMembers = sqliteTable(
  "network_members",
  {
    id: text("id").primaryKey(),
    networkId: text("network_id")
      .notNull()
      .references(() => networks.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: networkMemberRoles }).notNull().default("user"),
    status: text("status", { enum: networkMemberStatuses }).notNull().default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    unique().on(table.networkId, table.userId),
    index("idx_network_members_user").on(table.userId, table.status),
    index("idx_network_members_network").on(table.networkId, table.status),
  ],
);

/** Single-use hashed tokens for self-serve network setup (PC-357 / PC-360). */
export const networkSetupTokens = sqliteTable("network_setup_tokens", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenDigest: text("token_digest").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdNetworkId: text("created_network_id").references(() => networks.id),
  createdAt: text("created_at").notNull(),
});

/** Global platform knobs for network creation abuse controls (PC-357). */
export const platformSettings = sqliteTable("platform_settings", {
  id: integer("id").primaryKey(),
  maxNetworksPerEmail: integer("max_networks_per_email").notNull().default(3),
  maxNetworkCreatesPerDay: integer("max_network_creates_per_day").notNull().default(10),
  updatedAt: text("updated_at").notNull(),
});
