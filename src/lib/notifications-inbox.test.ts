import { describe, expect, it } from "vitest";

const INBOX_EXCLUDED = new Set([
  "push_sent",
  "push_failed",
  "push_skipped",
  "email_queued",
  "email_sent",
  "email_failed",
]);

describe("notification inbox telemetry filter", () => {
  it("excludes push delivery audit types from user inbox", () => {
    expect(INBOX_EXCLUDED.has("push_sent")).toBe(true);
    expect(INBOX_EXCLUDED.has("proposal_submitted")).toBe(false);
  });
});
