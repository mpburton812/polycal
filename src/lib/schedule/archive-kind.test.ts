import { describe, expect, it } from "vitest";

/**
 * Schedule inclusion rule for archived rows (PC-410).
 */
function includeOnSchedule(state: string, archiveKind: string | null): boolean {
  if (state !== "proposed" && state !== "resolved" && state !== "archived") return false;
  if (state === "archived" && archiveKind === "cancelled") return false;
  return true;
}

describe("schedule archiveKind filter (PC-410)", () => {
  it("hides user-cancelled archived proposals", () => {
    expect(includeOnSchedule("archived", "cancelled")).toBe(false);
  });

  it("keeps auto-archived proposals visible", () => {
    expect(includeOnSchedule("archived", "auto")).toBe(true);
  });

  it("keeps legacy archived without kind when times remain (treated as auto)", () => {
    expect(includeOnSchedule("archived", null)).toBe(true);
  });

  it("keeps proposed and resolved", () => {
    expect(includeOnSchedule("proposed", null)).toBe(true);
    expect(includeOnSchedule("resolved", null)).toBe(true);
  });
});
