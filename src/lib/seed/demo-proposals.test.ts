import { describe, expect, it } from "vitest";

import { localDateKey } from "@/lib/schedule/dates";
import { demoScheduleWindow } from "@/lib/seed/demo-proposals";

describe("demoScheduleWindow", () => {
  it("keeps offset-2 events inside the Sunday week when today is Sunday", () => {
    // Sunday 15 Nov 2026, 18:00 in America/New_York.
    const sundayEvening = new Date("2026-11-15T23:00:00.000Z");
    const window = demoScheduleWindow(2, 18, 3, { now: sundayEvening });

    expect(localDateKey(window.startAt, "America/New_York")).toBe("2026-11-17");
    expect(localDateKey(window.endAt, "America/New_York")).toBe("2026-11-17");
  });
});
