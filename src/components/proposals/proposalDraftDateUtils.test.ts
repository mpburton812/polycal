import { describe, expect, it } from "vitest";

import {
  localDateToStartIso,
  localDateToEndIso,
  toLocalDateInput,
} from "./proposalDraftDateUtils";
import { sleepingDateToStartIso } from "@/lib/proposals/sleeping-schedule";

/**
 * Date contract (PC-317): the same civil date must NOT resolve to the same
 * instant for sleeping (midnight-in-TZ) and all-day (noon-UTC) proposals.
 * Preview and persist paths must both use the sleeping helper for sleeping so
 * they agree — mixing the two makes a night land on the wrong civil day west of
 * UTC.
 */
describe("draft date helpers — sleeping vs all-day contract (PC-317)", () => {
  const civilDate = "2026-07-01";

  it("maps all-day dates to noon-UTC civil bounds", () => {
    expect(localDateToStartIso(civilDate)).toBe("2026-07-01T12:00:00.000Z");
    expect(localDateToEndIso(civilDate)).toBe("2026-07-01T12:00:00.000Z");
  });

  it("maps sleeping dates to midnight in a US timezone, distinct from all-day noon-UTC", () => {
    const sleepingEastern = sleepingDateToStartIso(civilDate, "America/New_York");
    const sleepingCentral = sleepingDateToStartIso(civilDate, "America/Chicago");
    const allDay = localDateToStartIso(civilDate);

    expect(sleepingEastern).toBe("2026-07-01T04:00:00.000Z"); // 00:00 EDT
    expect(sleepingCentral).toBe("2026-07-01T05:00:00.000Z"); // 00:00 CDT
    expect(sleepingEastern).not.toBe(allDay);
    expect(sleepingCentral).not.toBe(allDay);
  });

  it("formats stored sleeping ISO back to civil date in account TZ (PC-376)", () => {
    const iso = sleepingDateToStartIso("2026-07-01", "America/New_York")!;
    expect(toLocalDateInput(iso, "America/New_York")).toBe("2026-07-01");
  });
});
