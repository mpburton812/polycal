import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION, shouldSkipMigrations } from "./migrate";

describe("shouldSkipMigrations (PC-143)", () => {
  it("skips when stored version matches the target", () => {
    expect(shouldSkipMigrations(SCHEMA_VERSION)).toBe(true);
    expect(shouldSkipMigrations("21", "21")).toBe(true);
  });

  it("runs migrations when versions differ or are missing", () => {
    expect(shouldSkipMigrations(null)).toBe(false);
    expect(shouldSkipMigrations(undefined)).toBe(false);
    expect(shouldSkipMigrations("")).toBe(false);
    expect(shouldSkipMigrations("20")).toBe(false);
    expect(shouldSkipMigrations("20", "21")).toBe(false);
  });

  it("keeps verify-turso-schema.mjs in sync with SCHEMA_VERSION (PC-355)", () => {
    const verifyScript = readFileSync(
      path.join(process.cwd(), "scripts", "verify-turso-schema.mjs"),
      "utf8",
    );
    expect(verifyScript).toContain(`EXPECTED_SCHEMA_VERSION = "${SCHEMA_VERSION}"`);
  });

  it("scopes listPlaces residents and schedule slots to the active network (PC-450)", () => {
    const places = readFileSync(path.join(process.cwd(), "src/actions/places.ts"), "utf8");
    const schedule = readFileSync(path.join(process.cwd(), "src/actions/schedule.ts"), "utf8");
    expect(places).toContain("inArray(locationResidents.locationId, locationIds)");
    expect(schedule).toContain("eq(proposals.networkId, networkId)");
    expect(schedule).toContain("innerJoin(proposals, eq(proposalTimeSlots.proposalId, proposals.id))");
  });

  it("hosts ProposalDraftDialog only on the sage create host (PC-451)", () => {
    const host = readFileSync(
      path.join(process.cwd(), "src/components/proposals/ProposalCreateHost.tsx"),
      "utf8",
    );
    const proposals = readFileSync(
      path.join(process.cwd(), "src/components/proposals/ProposalsClient.tsx"),
      "utf8",
    );
    const schedule = readFileSync(
      path.join(process.cwd(), "src/components/schedule/ScheduleClient.tsx"),
      "utf8",
    );
    expect(host).toContain('import("./ProposalDraftDialog")');
    expect(proposals).not.toContain("ProposalDraftDialog");
    expect(schedule).not.toContain("ProposalDraftDialog");
  });

  it("backfills Booking enum literals in SCHEMA_VERSION 50 migrations (PC-427)", () => {
    const networks = readFileSync(
      path.join(process.cwd(), "src/lib/db/networks-migrations.ts"),
      "utf8",
    );
    const proposals = readFileSync(
      path.join(process.cwd(), "src/lib/db/proposals-migrations.ts"),
      "utf8",
    );
    expect(networks).toContain("proposals_and_bookings");
    expect(networks).toContain("proposals_and_schedule");
    expect(proposals).toContain("posting_kind = 'booking'");
    expect(proposals).toContain("posting_kind = 'schedule'");
  });
});
