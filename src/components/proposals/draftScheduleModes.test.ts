import { describe, expect, it } from "vitest";

import {
  flagsFromTimingMode,
  timingModeFromFlags,
} from "@/components/proposals/draftScheduleModes";

describe("timingModeFromFlags / flagsFromTimingMode (PC-170)", () => {
  it("maps poll / allDay / window", () => {
    expect(timingModeFromFlags({ allDay: false, isPoll: true })).toBe("poll");
    expect(timingModeFromFlags({ allDay: true, isPoll: false })).toBe("allDay");
    expect(timingModeFromFlags({ allDay: false, isPoll: false })).toBe("window");
  });

  it("does not encode recurring into timing mode", () => {
    expect(flagsFromTimingMode("window")).toEqual({ allDay: false, isPoll: false });
    expect(flagsFromTimingMode("allDay")).toEqual({ allDay: true, isPoll: false });
    expect(flagsFromTimingMode("poll")).toEqual({ allDay: false, isPoll: true });
  });
});
