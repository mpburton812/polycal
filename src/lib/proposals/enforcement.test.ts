import { describe, expect, it } from "vitest";

import { resolveResolvedArchiveEndAt } from "./enforcement";
import { sleepingCalendarDayEnd, sleepingDateToStartIso } from "./sleeping-schedule";

describe("resolveResolvedArchiveEndAt", () => {
  it("uses end of calendar day for single-night sleeping", () => {
    const start = sleepingDateToStartIso("2099-07-05")!;
    const end = resolveResolvedArchiveEndAt({
      id: "p1",
      proposalType: "sleeping",
      isBatchSleeping: false,
      scheduledStartAt: start,
      scheduledEndAt: null,
    });
    expect(end).toEqual(sleepingCalendarDayEnd(start));
  });

  it("uses end of last night for batch sleeping", () => {
    const lastNight = sleepingDateToStartIso("2099-07-10")!;
    const end = resolveResolvedArchiveEndAt({
      id: "p2",
      proposalType: "sleeping",
      isBatchSleeping: true,
      scheduledStartAt: sleepingDateToStartIso("2099-07-05")!,
      scheduledEndAt: lastNight,
    });
    expect(end).toEqual(sleepingCalendarDayEnd(lastNight));
  });

  it("uses scheduled end for timed events", () => {
    const start = "2099-07-05T18:00:00.000Z";
    const endIso = "2099-07-05T20:00:00.000Z";
    const end = resolveResolvedArchiveEndAt({
      id: "p3",
      proposalType: "event",
      isBatchSleeping: false,
      scheduledStartAt: start,
      scheduledEndAt: endIso,
    });
    expect(end).toEqual(new Date(endIso));
  });
});
