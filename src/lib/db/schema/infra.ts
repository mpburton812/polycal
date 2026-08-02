import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Tracks schema version for idempotent bootstrap migrations. */
export const schemaMeta = sqliteTable("schema_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Persistent rate-limit buckets (PC-282 / PC-397). Table is created by
 * `rate-limit-migrations.ts`; Drizzle model is for typed access and schema docs.
 */
export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});
