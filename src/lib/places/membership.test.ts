import { describe, expect, it } from "vitest";

import { groupAcceptedPlaceMembers } from "@/lib/places/membership";

describe("groupAcceptedPlaceMembers (PC-449)", () => {
  it("buckets owners and residents by location", () => {
    const grouped = groupAcceptedPlaceMembers([
      { locationId: "p1", displayName: "Luke", placeRole: "owner" },
      { locationId: "p1", displayName: "Leia", placeRole: "resident" },
      { locationId: "p2", displayName: "Han", placeRole: "owner" },
    ]);
    expect(grouped.get("p1")).toEqual({ owners: ["Luke"], residents: ["Leia"] });
    expect(grouped.get("p2")).toEqual({ owners: ["Han"], residents: [] });
  });
});
