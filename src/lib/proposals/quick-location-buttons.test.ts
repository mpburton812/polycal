import { describe, expect, it } from "vitest";

import { buildQuickLocationButtons } from "@/lib/proposals/quick-location-buttons";

describe("buildQuickLocationButtons (PC-436)", () => {
  const places = [
    { id: "luke-home", name: "Skywalker Ranch", residentUserIds: ["luke"] },
    { id: "leia-apt", name: "Alderaan Apt", residentUserIds: ["leia"] },
    { id: "shared", name: "The Shared House", residentUserIds: ["luke", "leia"] },
  ];
  const people = [
    { id: "luke", displayName: "Luke" },
    { id: "leia", displayName: "Leia" },
  ];

  it("puts My Place first for the viewer", () => {
    const buttons = buildQuickLocationButtons({
      places,
      people,
      viewerId: "luke",
      selectedUserIds: ["leia"],
    });
    expect(buttons[0]?.label).toMatch(/^My Place/);
    expect(buttons[0]?.locationId).toBe("luke-home");
    expect(buttons.map((b) => b.locationId)).toContain("leia-apt");
  });

  it("puts the Booking-for person's home first", () => {
    const buttons = buildQuickLocationButtons({
      places,
      people,
      viewerId: "luke",
      selectedUserIds: [],
      onBehalfOfUserId: "leia",
    });
    expect(buttons[0]?.locationId).toBe("leia-apt");
    expect(buttons[0]?.label).toMatch(/Leia/i);
  });

  it("deduplicates shared houses", () => {
    const buttons = buildQuickLocationButtons({
      places,
      people,
      viewerId: "luke",
      selectedUserIds: ["leia"],
    });
    const ids = buttons.map((b) => b.locationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
