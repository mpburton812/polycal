import { describe, expect, it } from "vitest";

import {
  getEffectiveEventEndAt,
  isEventHappeningNow,
} from "@/lib/feed/active-events";

const NOW = new Date("2026-07-22T14:00:00.000Z");

function event(overrides: Partial<Parameters<typeof isEventHappeningNow>[0]> = {}) {
  return {
    proposalType: "event",
    state: "resolved",
    scheduledStartAt: "2026-07-22T13:00:00.000Z",
    scheduledEndAt: "2026-07-22T15:00:00.000Z",
    ...overrides,
  };
}

describe("getEffectiveEventEndAt", () => {
  it("uses the scheduled end when one exists", () => {
    expect(
      getEffectiveEventEndAt(
        "2026-07-22T13:00:00.000Z",
        "2026-07-22T15:00:00.000Z",
      ),
    ).toBe("2026-07-22T15:00:00.000Z");
  });

  it("falls back to the start for an instantaneous event", () => {
    expect(getEffectiveEventEndAt("2026-07-22T14:00:00.000Z", null)).toBe(
      "2026-07-22T14:00:00.000Z",
    );
  });
});

describe("isEventHappeningNow", () => {
  it("includes resolved events between their start and end", () => {
    expect(isEventHappeningNow(event(), NOW)).toBe(true);
  });

  it("treats the start and end boundaries as inclusive", () => {
    expect(
      isEventHappeningNow(
        event({ scheduledStartAt: NOW.toISOString() }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isEventHappeningNow(
        event({ scheduledEndAt: NOW.toISOString() }),
        NOW,
      ),
    ).toBe(true);
  });

  it("only includes a missing-end event at its start instant", () => {
    expect(
      isEventHappeningNow(
        event({ scheduledStartAt: NOW.toISOString(), scheduledEndAt: null }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isEventHappeningNow(
        event({
          scheduledStartAt: "2026-07-22T13:59:59.999Z",
          scheduledEndAt: null,
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("excludes sleeping, unresolved, future, and ended proposals", () => {
    expect(isEventHappeningNow(event({ proposalType: "sleeping" }), NOW)).toBe(false);
    expect(isEventHappeningNow(event({ state: "proposed" }), NOW)).toBe(false);
    expect(
      isEventHappeningNow(
        event({ scheduledStartAt: "2026-07-22T14:00:00.001Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isEventHappeningNow(
        event({ scheduledEndAt: "2026-07-22T13:59:59.999Z" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("fails closed for missing or malformed timestamps", () => {
    expect(isEventHappeningNow(event({ scheduledStartAt: null }), NOW)).toBe(false);
    expect(isEventHappeningNow(event({ scheduledStartAt: "not-a-date" }), NOW)).toBe(false);
  });
});
