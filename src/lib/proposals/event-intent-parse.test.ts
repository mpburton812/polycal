import { describe, expect, it } from "vitest";

import { parseEventIntent, sleepingWeekendNights } from "@/lib/proposals/event-intent-parse";

const people = [
  { id: "morgan", displayName: "Morgan" },
  { id: "katie", displayName: "Katie" },
  { id: "zachary", displayName: "Zachary" },
  { id: "alex", displayName: "Alex" },
];
const places = [
  { id: "katie-home", name: "Katie's Place", residentUserIds: ["katie"] },
  { id: "morgan-home", name: "Morgan's Place", residentUserIds: ["morgan"] },
  { id: "zachary-home", name: "Zachary's Place", residentUserIds: ["zachary"] },
  { id: "mine", name: "Skywalker Ranch", residentUserIds: ["luke"] },
];

describe("parseEventIntent (PC-442)", () => {
  it("parses dinner tonight with a time window as Social", () => {
    const now = new Date("2026-08-18T12:00:00");
    const result = parseEventIntent({
      text: "Dinner tonight 7pm-9pm",
      now,
    });
    expect(result.proposalType).toBe("event");
    expect(result.title.toLowerCase()).toContain("dinner");
    expect(result.startTime).toBe("19:00");
    expect(result.endTime).toBe("21:00");
    expect(result.allDay).toBe(false);
    expect(result.chips.some((chip) => chip.kind === "time")).toBe(true);
  });

  it("parses overnight at my place with a person", () => {
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

  it("treats spending the night and staying at as Sleeping", () => {
    expect(
      parseEventIntent({ text: "Spending the night at Katie's" }).proposalType,
    ).toBe("sleeping");
    expect(parseEventIntent({ text: "Staying at Katie's tonight" }).proposalType).toBe(
      "sleeping",
    );
  });

  it("parses Morgan sleeps at Katie's tonight as Booking-for Morgan with Katie", () => {
    const now = new Date("2026-08-18T12:00:00");
    const result = parseEventIntent({
      text: "Morgan sleeps at Katie's tonight",
      now,
      people,
      places,
      viewerId: "luke",
    });
    expect(result.proposalType).toBe("sleeping");
    expect(result.sleeperUserId).toBe("morgan");
    expect(result.hostUserId).toBe("katie");
    expect(result.needsBookingFor).toBe(true);
    expect(result.intentionalSolo).toBe(false);
    expect(result.personIds).toEqual(["katie"]);
    expect(result.locationId).toBe("katie-home");
    expect(result.startDate).toBe("2026-08-18");
  });

  it("parses Morgan sleeps at Katie's alone this weekend as solo Fri–Sat at Katie's", () => {
    const now = new Date("2026-08-18T12:00:00");
    const weekend = sleepingWeekendNights(now);
    const result = parseEventIntent({
      text: "Morgan sleeps at Katie's alone this weekend.",
      now,
      people,
      places,
      viewerId: "luke",
    });
    expect(result.proposalType).toBe("sleeping");
    expect(result.sleeperUserId).toBe("morgan");
    expect(result.intentionalSolo).toBe(true);
    expect(result.personIds).toEqual([]);
    expect(result.locationId).toBe("katie-home");
    expect(result.startDate).toBe(weekend.startDate);
    expect(result.endDate).toBe(weekend.endDate);
    expect(weekend.startDate).toBe("2026-08-21");
    expect(weekend.endDate).toBe("2026-08-22");
  });

  it("parses Morgan sleeps at their place tomorrow as solo at Morgan's", () => {
    const now = new Date("2026-08-18T12:00:00");
    const result = parseEventIntent({
      text: "Morgan sleeps at their place tomorrow",
      now,
      people,
      places,
      viewerId: "luke",
    });
    expect(result.sleeperUserId).toBe("morgan");
    expect(result.intentionalSolo).toBe(true);
    expect(result.locationId).toBe("morgan-home");
    expect(result.personIds).toEqual([]);
    expect(result.startDate).toBe("2026-08-19");
    expect(result.needsBookingFor).toBe(true);
  });

  it("parses Katie sleeps at Morgan's tonight", () => {
    const now = new Date("2026-08-18T12:00:00");
    const result = parseEventIntent({
      text: "Katie sleeps at Morgan's tonight.",
      now,
      people,
      places,
      viewerId: "luke",
    });
    expect(result.sleeperUserId).toBe("katie");
    expect(result.hostUserId).toBe("morgan");
    expect(result.personIds).toEqual(["morgan"]);
    expect(result.locationId).toBe("morgan-home");
    expect(result.needsBookingFor).toBe(true);
  });

  it("parses Katie sleeps at Zachary's while Morgan is viewer", () => {
    const now = new Date("2026-08-18T12:00:00");
    const result = parseEventIntent({
      text: "Katie sleeps at Zachary's tonight",
      now,
      people,
      places,
      viewerId: "morgan",
    });
    expect(result.sleeperUserId).toBe("katie");
    expect(result.hostUserId).toBe("zachary");
    expect(result.personIds).toEqual(["zachary"]);
    expect(result.locationId).toBe("zachary-home");
    expect(result.needsBookingFor).toBe(true);
  });

  it("parses Leia sleeps at Luke's tonight as Booking-for Leia with Luke as host", () => {
    const now = new Date("2026-08-18T12:00:00");
    const result = parseEventIntent({
      text: "Leia sleeps at Luke's tonight",
      now,
      people: [
        { id: "sw-luke", displayName: "Luke Skywalker" },
        { id: "sw-leia", displayName: "Leia Organa" },
      ],
      places: [{ id: "loc-falcon", name: "Millennium Falcon", residentUserIds: ["sw-luke"] }],
      viewerId: "sw-luke",
    });
    expect(result.proposalType).toBe("sleeping");
    expect(result.sleeperUserId).toBe("sw-leia");
    expect(result.hostUserId).toBe("sw-luke");
    expect(result.needsBookingFor).toBe(true);
    expect(result.personIds).toEqual(["sw-luke"]);
    expect(result.locationId).toBe("loc-falcon");
    expect(result.startDate).toBe("2026-08-18");
  });

  it("does not need Booking-for when the viewer is the sleeper", () => {
    const result = parseEventIntent({
      text: "Morgan sleeps at Katie's tonight",
      now: new Date("2026-08-18T12:00:00"),
      people,
      places,
      viewerId: "morgan",
    });
    expect(result.sleeperUserId).toBe("morgan");
    expect(result.needsBookingFor).toBe(false);
    expect(result.personIds).toEqual(["katie"]);
  });

  it("returns empty chips for blank text", () => {
    expect(parseEventIntent({ text: "  " }).chips).toEqual([]);
    expect(parseEventIntent({ text: "  " }).proposalType).toBeNull();
  });
});
