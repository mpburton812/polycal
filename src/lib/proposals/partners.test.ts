import { describe, expect, it, vi } from "vitest";

import {
  getAcceptedSleepingPartnerIds,
  getEligibleLocationIdsForUser,
} from "./partners";

describe("partners helpers", () => {
  it("maps accepted undirected partnership edges to partner ids", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { userLowId: "u1", userHighId: "u2" },
            { userLowId: "u0", userHighId: "u1" },
          ]),
        }),
      }),
    };

    const partners = await getAcceptedSleepingPartnerIds(db as never, "u1");
    expect([...partners].sort()).toEqual(["u0", "u2"]);
  });

  it("unions own residencies with accepted partners' places", async () => {
    const whereResults = [
      [{ locationId: "loc-own" }],
      [
        { userLowId: "u1", userHighId: "u2" },
      ],
      [{ locationId: "loc-partner" }],
    ];
    let whereCall = 0;
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            const result = whereResults[whereCall] ?? [];
            whereCall += 1;
            return Promise.resolve(result);
          }),
        }),
      }),
    };

    const locationIds = await getEligibleLocationIdsForUser(db as never, "u1");
    expect(locationIds.sort()).toEqual(["loc-own", "loc-partner"]);
  });
});
