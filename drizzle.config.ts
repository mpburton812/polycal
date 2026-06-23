import { defineConfig } from "drizzle-kit";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
