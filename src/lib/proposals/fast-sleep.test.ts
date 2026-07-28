import { describe, expect, it } from "vitest";

import { userOnBatchNight } from "@/lib/calendar/payloads";
import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";
import {
  isFastSleepSubjectAuthorized,
  validateFastSleepEntries,
} from "@/lib/proposals/fast-sleep";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";
import { sleepingDateToStartIso, isoToSleepingDateInput } from "@/lib/proposals/sleeping-schedule";

describe("isSleepingLikeType", () => {
  it("includes sleeping and fast_sleep", () => {
    expect(isSleepingLikeType("sleeping")).toBe(true);
    expect(isSleepingLikeType("fast_sleep")).toBe(true);
    expect(isSleepingLikeType("event")).toBe(false);
  });
});

describe("isFastSleepSubjectAuthorized (rule B)", () => {
  const scheduler = "A";
  const direct = new Set(["B"]);
  const reachable = new Set(["A", "B", "C"]);

  it("allows self and direct partner subjects", () => {
    expect(isFastSleepSubjectAuthorized(scheduler, "A", direct, reachable)).toBe(true);
    expect(isFastSleepSubjectAuthorized(scheduler, "B", direct, reachable)).toBe(true);
  });

  it("allows partner-of-partner subject when reachable", () => {
    expect(isFastSleepSubjectAuthorized(scheduler, "C", direct, reachable)).toBe(true);
  });

  it("rejects unrelated subjects", () => {
    expect(isFastSleepSubjectAuthorized(scheduler, "D", direct, reachable)).toBe(false);
  });
});

describe("userOnBatchNight", () => {
  const entry = (partial: Partial<BatchSleepingEntry>): BatchSleepingEntry => ({
    id: "bse-1",
    nightDate: "2026-08-01",
    invitees: [],
    ...partial,
  });

  it("counts FastSleep subject as on the night even when not proposer", () => {
    const night = entry({
      subjectUserId: "B",
      intentionalSolo: true,
    });
    expect(userOnBatchNight("A", night, "B")).toBe(true);
    expect(userOnBatchNight("A", night, "A")).toBe(false);
  });

  it("includes invitees on subject nights", () => {
    const night = entry({
      subjectUserId: "B",
      invitees: [{ userId: "C", role: "optional" }],
    });
    expect(userOnBatchNight("A", night, "C")).toBe(true);
    expect(userOnBatchNight("A", night, "B")).toBe(true);
    expect(userOnBatchNight("A", night, "A")).toBe(false);
  });

  it("keeps legacy proposer-on-all-nights when subject is omitted", () => {
    const night = entry({
      intentionalSolo: true,
    });
    expect(userOnBatchNight("A", night, "A")).toBe(true);
  });
});

describe("FastSleep civil night timezone", () => {
  it("maps Chicago midnight so Eastern-default ISO is not a day early", () => {
    const chicago = sleepingDateToStartIso("2026-07-21", "America/Chicago")!;
    const easternDefault = sleepingDateToStartIso("2026-07-21", "America/New_York")!;
    expect(isoToSleepingDateInput(easternDefault, "America/Chicago")).toBe("2026-07-20");
    expect(isoToSleepingDateInput(chicago, "America/Chicago")).toBe("2026-07-21");
  });
});

describe("validateFastSleepEntries A–C rejection (unit shape)", () => {
  it("exports validateFastSleepEntries", () => {
    expect(typeof validateFastSleepEntries).toBe("function");
  });
});
