import { describe, expect, it } from "vitest";

import {
  adminFastSleepingPlanSchema,
  buildBatchEntriesFromRows,
  buildEmptyGridRows,
  fastSleepingRowHasContent,
  rowsFromBatchEntries,
  type FastSleepingRow,
} from "./fast-sleeping-plan";

describe("adminFastSleepingPlanSchema", () => {
  it("requires target user and at least one row", () => {
    const result = adminFastSleepingPlanSchema.safeParse({
      targetUserId: "",
      rows: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts up to 14 rows", () => {
    const rows: FastSleepingRow[] = Array.from({ length: 14 }, (_, index) => ({
      nightDate: `2099-01-${String(index + 1).padStart(2, "0")}`,
      inviteeUserIds: [],
      intentionalSolo: true,
    }));
    const result = adminFastSleepingPlanSchema.safeParse({
      targetUserId: "user-1",
      rows,
      confirm: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 14 rows", () => {
    const rows: FastSleepingRow[] = Array.from({ length: 15 }, (_, index) => ({
      nightDate: `2099-01-${String(index + 1).padStart(2, "0")}`,
      inviteeUserIds: ["partner-1"],
    }));
    const result = adminFastSleepingPlanSchema.safeParse({
      targetUserId: "user-1",
      rows,
    });
    expect(result.success).toBe(false);
  });

  it("defaults confirm to false", () => {
    const result = adminFastSleepingPlanSchema.safeParse({
      targetUserId: "user-1",
      rows: [{ nightDate: "2099-07-01", inviteeUserIds: ["p1"], intentionalSolo: false }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirm).toBe(false);
    }
  });
});

describe("fastSleepingRowHasContent", () => {
  it("detects configured rows", () => {
    expect(
      fastSleepingRowHasContent({
        nightDate: "2099-07-01",
        inviteeUserIds: [],
      }),
    ).toBe(false);
    expect(
      fastSleepingRowHasContent({
        nightDate: "2099-07-01",
        inviteeUserIds: ["p1"],
      }),
    ).toBe(true);
    expect(
      fastSleepingRowHasContent({
        nightDate: "2099-07-01",
        inviteeUserIds: [],
        intentionalSolo: true,
      }),
    ).toBe(true);
    expect(
      fastSleepingRowHasContent({
        nightDate: "2099-07-01",
        inviteeUserIds: [],
        locationText: "  Away  ",
      }),
    ).toBe(true);
  });
});

describe("buildBatchEntriesFromRows", () => {
  it("skips empty nights and maps invitees to required", () => {
    const entries = buildBatchEntriesFromRows([
      { nightDate: "2099-07-01", inviteeUserIds: [] },
      { nightDate: "2099-07-02", inviteeUserIds: ["p1", "p2"] },
      { nightDate: "2099-07-03", inviteeUserIds: [], intentionalSolo: true },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.nightDate).toBe("2099-07-02");
    expect(entries[0]?.invitees).toEqual([
      { userId: "p1", role: "required" },
      { userId: "p2", role: "required" },
    ]);
    expect(entries[1]?.intentionalSolo).toBe(true);
    expect(entries[1]?.invitees).toEqual([]);
  });
});

describe("buildEmptyGridRows", () => {
  it("returns 14 nights starting today", () => {
    const rows = buildEmptyGridRows();
    expect(rows).toHaveLength(14);
    expect(rows[0]?.inviteeUserIds).toEqual([]);
    expect(rows[0]?.intentionalSolo).toBe(false);
  });
});

describe("rowsFromBatchEntries", () => {
  it("overlays entries onto the fixed grid by date", () => {
    const base = buildEmptyGridRows();
    const targetDate = base[2]!.nightDate;
    const rows = rowsFromBatchEntries(
      [
        {
          id: "bse-1",
          nightDate: targetDate,
          intentionalSolo: false,
          invitees: [{ userId: "p1", role: "required" }],
          locationText: "Cabin",
        },
      ],
      base,
    );
    expect(rows).toHaveLength(14);
    expect(rows[2]?.inviteeUserIds).toEqual(["p1"]);
    expect(rows[2]?.locationText).toBe("Cabin");
  });
});
