import { describe, expect, it } from "vitest";

import { formatDraftReturnNotification } from "./notifications-draft-return";

describe("formatDraftReturnNotification", () => {
  it("includes title, reason, and no-action copy (PC-261)", () => {
    expect(formatDraftReturnNotification("Cool Kids Trip", "required decline")).toBe(
      "The Cool Kids Trip proposal was sent back to drafts : required decline. No additional action required.",
    );
  });

  it("falls back when reason is blank", () => {
    expect(formatDraftReturnNotification("Party", "   ")).toContain("No reason provided");
  });
});
