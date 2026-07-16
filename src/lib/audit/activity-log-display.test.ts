import { describe, expect, it } from "vitest";

import {
  formatActivityLogAction,
  formatActivityLogDetails,
} from "./activity-log-display";

describe("activity-log-display (PC-245)", () => {
  it("never returns raw JSON for unknown payloads", () => {
    const details = JSON.stringify({ userId: "u-1", username: "luke" });
    const formatted = formatActivityLogDetails("users.create_active", details);
    expect(formatted).not.toContain("{");
    expect(formatted).toContain("luke");
  });

  it("formats force reload environment", () => {
    expect(
      formatActivityLogDetails("admin.force_reload", JSON.stringify({ environment: "dev" })),
    ).toBe("Environment: dev");
  });

  it("labels common actions", () => {
    expect(formatActivityLogAction("users.admin_pause")).toBe("Paused user");
    expect(formatActivityLogAction("places.add_person")).toBe("Added person to place");
  });

  it("falls back to action label when JSON has no useful fields", () => {
    const formatted = formatActivityLogDetails("mystery.action", JSON.stringify({ foo: 1 }));
    expect(formatted).not.toMatch(/^\s*\{/);
    expect(formatted.length).toBeGreaterThan(0);
  });
});
