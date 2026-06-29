import { describe, expect, it } from "vitest";

import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";
import { formatBatchNightLine } from "@/lib/proposals/batch-night-display";

describe("formatBatchNightLine", () => {
  it("formats solo and partnered nights with comments", () => {
    const solo: BatchSleepingEntry = {
      id: "n1",
      nightDate: "2099-08-01",
      locationId: "loc-katies-place",
      intentionalSolo: true,
      invitees: [],
    };
    const partnered: BatchSleepingEntry = {
      id: "n4",
      nightDate: "2099-08-04",
      locationId: "loc-michaels-place",
      invitees: [{ userId: "tf-mpburton", role: "required" }],
      comment: "It's our anniversary!",
    };

    const inviteeNames = new Map([["tf-mpburton", "Michael Burton"]]);
    const placeNames = new Map([
      ["loc-katies-place", "Katie's Place"],
      ["loc-michaels-place", "Michael's Place"],
    ]);

    expect(
      formatBatchNightLine(solo, { inviteeNames, placeNames, nightIndex: 0 }),
    ).toBe("Night 1: 2099-08-01 · Katie's Place · Solo");

    expect(
      formatBatchNightLine(partnered, { inviteeNames, placeNames, nightIndex: 3 }),
    ).toContain("Michael Burton (required)");
    expect(
      formatBatchNightLine(partnered, { inviteeNames, placeNames, nightIndex: 3 }),
    ).toContain(`"It's our anniversary!"`);
  });
});
