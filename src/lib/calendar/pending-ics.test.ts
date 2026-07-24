import { describe, expect, it } from "vitest";

import { latestIcsPendingIdsByProposal } from "@/lib/calendar/pending-ics";

describe("latestIcsPendingIdsByProposal", () => {
  it("returns empty map when proposal id list is empty", async () => {
    const map = await latestIcsPendingIdsByProposal(
      {
        select: () => {
          throw new Error("should not query");
        },
      } as never,
      "user-1",
      [],
    );
    expect(map.size).toBe(0);
  });
});
