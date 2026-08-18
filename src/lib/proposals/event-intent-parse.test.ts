import { describe, expect, it } from "vitest";

import { parseEventIntent } from "@/lib/proposals/event-intent-parse";

const people = [{ id: "alex", displayName: "Alex" }];
const places = [
  { id: "mine", name: "Skywalker Ranch", residentUserIds: ["luke"] },
];

describe("parseEventIntent (PC-433)", () => {
  it("parses dinner tonight with a time window", () => {
    const now = new Date("2026-08-18T12:00:00");
    const result = parseEventIntent({
      text: "Dinner tonight 7pm-9pm",
      now,
    });
    expect(result.title.toLowerCase()).toContain("dinner");
    expect(result.startTime).toBe("19:00");
    expect(result.endTime).toBe("21:00");
    expect(result.allDay).toBe(false);
    expect(result.chips.some((chip) => chip.kind === "time")).toBe(true);
  });

  it("parses overnight at my place with a person and a weekend range", () => {
    const now = new Date("2026-08-18T12:00:00");
    const result = parseEventIntent({
      text: "Overnight at my place with Alex Friday to Sunday",
      now,
      people,
      places,
      viewerId: "luke",
    });
    expect(result.proposalType).toBe("sleeping");
    expect(result.personIds).toContain("alex");
    expect(result.locationId).toBe("mine");
    expect(result.startDate).toBeTruthy();
    expect(result.endDate).toBeTruthy();
    expect(result.chips.some((chip) => chip.kind === "location")).toBe(true);
  });

  it("returns empty chips for blank text", () => {
    expect(parseEventIntent({ text: "  " }).chips).toEqual([]);
  });
});
