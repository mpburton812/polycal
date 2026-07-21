import { describe, expect, it } from "vitest";

import { BOTTOM_NAV_ICON_PX, FEED_LIKE_BIRD_PX } from "./feedIconSizes";

describe("feedIconSizes", () => {
  it("keeps like birds at 3× the prior half-nav size (36px)", () => {
    expect(BOTTOM_NAV_ICON_PX).toBe(24);
    expect(FEED_LIKE_BIRD_PX).toBe(36);
    expect(FEED_LIKE_BIRD_PX).toBe((BOTTOM_NAV_ICON_PX / 2) * 3);
  });
});
