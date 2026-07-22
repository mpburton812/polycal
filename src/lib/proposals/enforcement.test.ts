import { describe, expect, it } from "vitest";

import {
  computeAtRiskExpiresAt,
  computeProposedExpiresAt,
  computeScheduleExpirationInstant,
  resolveResolvedArchiveEndAt,
  type EnforcementSettings,
} from "./enforcement";
import { sleepingCalendarDayEnd, sleepingDateToStartIso } from "./sleeping-schedule";

const settings: EnforcementSettings = {
  atRiskTtlDays: 7,
  archiveGraceHours: 24,
  proposedMaxDays: 14,
  redraftDeadlineHours: 24,
  sleepingPartnerProposalMaxDays: 14,
};

describe("computeAtRiskExpiresAt", () => {
  it("uses full TTL when event start is already in the past", () => {
    const fromMs = Date.parse("2026-07-21T20:50:00.000Z");
    const pastStart = "2026-07-21T04:00:00.000Z";
    const expires = computeAtRiskExpiresAt(settings, pastStart, fromMs);
    expect(expires).toBe(new Date(fromMs + 7 * 24 * 60 * 60 * 1000).toISOString());
  });

  it("still caps to T-minus redraft when the event is in the future", () => {
    const fromMs = Date.parse("2026-07-01T12:00:00.000Z");
    // Far enough that T-minus redraft is sooner than the 7-day TTL.
    const futureStart = "2026-07-05T04:00:00.000Z";
    const expires = computeAtRiskExpiresAt(settings, futureStart, fromMs);
    expect(expires).toBe("2026-07-04T04:00:00.000Z");
  });
});

describe("computeProposedExpiresAt", () => {
  it("returns the earlier of schedule and max-days wall", () => {
    const expires = computeProposedExpiresAt(
      "2099-07-10T12:00:00.000Z",
      "2099-07-01T12:00:00.000Z",
      3,
    );
    expect(expires).toBe("2099-07-04T12:00:00.000Z");
  });

  it("uses schedule only when proposedMaxDays is 0", () => {
    const expires = computeProposedExpiresAt(
      "2099-07-10T12:00:00.000Z",
      "2099-07-01T12:00:00.000Z",
      0,
    );
    expect(expires).toBe("2099-07-10T12:00:00.000Z");
  });

  it("uses max-days wall when schedule is null", () => {
    const expires = computeProposedExpiresAt(null, "2099-07-01T12:00:00.000Z", 2);
    expect(expires).toBe("2099-07-03T12:00:00.000Z");
  });
});

describe("computeScheduleExpirationInstant", () => {
  it("uses end of calendar day for sleeping", () => {
    const start = sleepingDateToStartIso("2099-07-05")!;
    const instant = computeScheduleExpirationInstant(
      {
        id: "p1",
        proposalType: "sleeping",
        isBatchSleeping: false,
        scheduledStartAt: start,
        scheduledEndAt: null,
      },
      [],
    );
    expect(instant).toBe(sleepingCalendarDayEnd(start).toISOString());
  });
});

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
