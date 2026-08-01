import { describe, expect, it } from "vitest";

import {
  adminFastSleepingPlanSchema,
  buildBatchEntriesFromRows,
  buildEmptyGridRows,
  createEmptyFastSleepingRow,
  FAST_SLEEPING_MAX_SLOTS,
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

  it("accepts up to 28 rows (multi-slot same night)", () => {
    const rows: FastSleepingRow[] = Array.from({ length: FAST_SLEEPING_MAX_SLOTS }, (_, index) => ({
      nightDate: `2099-01-${String((index % 28) + 1).padStart(2, "0")}`,
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

  it("rejects more than 28 rows", () => {
    const rows: FastSleepingRow[] = Array.from({ length: 29 }, (_, index) => ({
      nightDate: `2099-01-${String((index % 28) + 1).padStart(2, "0")}`,
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
  it("detects configured rows including notes", () => {
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
    expect(
      fastSleepingRowHasContent({
        nightDate: "2099-07-01",
        inviteeUserIds: [],
        comment: "note only",
      }),
    ).toBe(true);
  });
});

describe("buildBatchEntriesFromRows", () => {
  it("skips empty nights and maps invitees to optional by default (PC-374)", () => {
    const entries = buildBatchEntriesFromRows([
      { nightDate: "2099-07-01", inviteeUserIds: [] },
      { nightDate: "2099-07-02", inviteeUserIds: ["p1", "p2"] },
      { nightDate: "2099-07-03", inviteeUserIds: [], intentionalSolo: true },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.nightDate).toBe("2099-07-02");
    expect(entries[0]?.invitees).toEqual([
      { userId: "p1", role: "optional" },
      { userId: "p2", role: "optional" },
    ]);
    expect(entries[1]?.intentionalSolo).toBe(true);
    expect(entries[1]?.invitees).toEqual([]);
  });

  it("honors explicit required roles on partners", () => {
    const entries = buildBatchEntriesFromRows([
      {
        nightDate: "2099-07-02",
        inviteeUserIds: ["p1", "p2"],
        inviteeRoles: { p1: "required", p2: "optional" },
      },
    ]);
    expect(entries[0]?.invitees).toEqual([
      { userId: "p1", role: "required" },
      { userId: "p2", role: "optional" },
    ]);
  });

  it("keeps two solos on the same night and passes comments (PC-383)", () => {
    const entries = buildBatchEntriesFromRows(
      [
        {
          id: "bse-a",
          nightDate: "2099-07-10",
          subjectUserId: "michael",
          inviteeUserIds: [],
          intentionalSolo: true,
          comment: "Michael alone",
        },
        {
          id: "bse-b",
          nightDate: "2099-07-10",
          subjectUserId: "katie",
          inviteeUserIds: [],
          intentionalSolo: true,
          comment: "Katie alone",
        },
      ],
      "scheduler",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]?.nightDate).toBe("2099-07-10");
    expect(entries[1]?.nightDate).toBe("2099-07-10");
    expect(entries[0]?.subjectUserId).toBe("michael");
    expect(entries[1]?.subjectUserId).toBe("katie");
    expect(entries[0]?.comment).toBe("Michael alone");
    expect(entries[1]?.comment).toBe("Katie alone");
  });
});

describe("buildEmptyGridRows", () => {
  it("returns 14 nights starting today with stable ids", () => {
    const rows = buildEmptyGridRows();
    expect(rows).toHaveLength(14);
    expect(rows[0]?.inviteeUserIds).toEqual([]);
    expect(rows[0]?.intentionalSolo).toBe(false);
    expect(rows[0]?.id).toBeTruthy();
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

  it("emits multiple slots for the same nightDate (PC-383)", () => {
    const base = buildEmptyGridRows();
    const targetDate = base[1]!.nightDate;
    const rows = rowsFromBatchEntries(
      [
        {
          id: "bse-1",
          nightDate: targetDate,
          subjectUserId: "a",
          intentionalSolo: true,
          invitees: [],
          comment: "A",
        },
        {
          id: "bse-2",
          nightDate: targetDate,
          subjectUserId: "b",
          intentionalSolo: true,
          invitees: [],
          comment: "B",
        },
      ],
      base,
    );
    const sameNight = rows.filter((row) => row.nightDate === targetDate);
    expect(sameNight).toHaveLength(2);
    expect(sameNight.map((row) => row.subjectUserId).sort()).toEqual(["a", "b"]);
    expect(rows.length).toBe(15);
  });
});

describe("createEmptyFastSleepingRow", () => {
  it("clones a night date for an extra slot", () => {
    const row = createEmptyFastSleepingRow("2099-08-01", "user-1");
    expect(row.nightDate).toBe("2099-08-01");
    expect(row.subjectUserId).toBe("user-1");
    expect(row.id).toMatch(/^bse-/);
  });
});
