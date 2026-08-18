import { describe, expect, it } from "vitest";

import { rankPeople } from "@/lib/proposals/composer-people-rank";

describe("rankPeople (PC-435)", () => {
  const people = [
    { id: "c", displayName: "Chewie" },
    { id: "a", displayName: "Leia" },
    { id: "b", displayName: "Han" },
  ];

  it("sorts by frequency then recency then name", () => {
    const ranked = rankPeople(people, [
      { userId: "b", inviteCount: 2, lastAt: "2026-01-01T00:00:00.000Z" },
      { userId: "a", inviteCount: 5, lastAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(ranked.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("boosts sleeping partners when counts are equal", () => {
    const ranked = rankPeople(people, [], { partnerIds: ["c"] });
    expect(ranked[0]?.id).toBe("c");
  });
});
