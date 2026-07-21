import { describe, expect, it } from "vitest";

import { BOTTOM_NAV_ICON_PX, FEED_LIKE_BIRD_PX } from "./feedIconSizes";

describe("feedIconSizes", () => {
  it("keeps like birds at half the bottom-nav parrot size", () => {
    expect(BOTTOM_NAV_ICON_PX).toBe(24);
    expect(FEED_LIKE_BIRD_PX).toBe(12);
    expect(FEED_LIKE_BIRD_PX * 2).toBe(BOTTOM_NAV_ICON_PX);
  });
});
