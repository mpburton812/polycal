import { describe, expect, it } from "vitest";

import { dayGridSpanMinutes } from "./day-span";
import { zonedWallTimeToUtc } from "./dates";

const TZ = "America/New_York";

describe("dayGridSpanMinutes", () => {
  it("spans a multi-hour event across its full duration", () => {
    const start = zonedWallTimeToUtc("2099-07-15", 14, 0, 0, 0, TZ).toISOString();
    const end = zonedWallTimeToUtc("2099-07-15", 17, 0, 0, 0, TZ).toISOString();
    const span = dayGridSpanMinutes(start, end, "2099-07-15", TZ);
    expect(span.endMin - span.startMin).toBe(180);
  });

  it("runs to midnight when the end is the next civil day", () => {
    const start = zonedWallTimeToUtc("2099-07-15", 22, 0, 0, 0, TZ).toISOString();
    const end = zonedWallTimeToUtc("2099-07-16", 2, 0, 0, 0, TZ).toISOString();
    const span = dayGridSpanMinutes(start, end, "2099-07-15", TZ);
    expect(span.startMin).toBe(22 * 60);
    expect(span.endMin).toBe(24 * 60);
  });

  it("collapses to one hour only when the end is missing", () => {
    const start = zonedWallTimeToUtc("2099-07-15", 14, 0, 0, 0, TZ).toISOString();
    const span = dayGridSpanMinutes(start, null, "2099-07-15", TZ);
    expect(span.endMin - span.startMin).toBe(60);
  });
});
