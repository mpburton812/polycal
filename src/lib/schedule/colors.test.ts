import { describe, expect, it } from "vitest";

import { scheduleBlockVariant } from "./colors";

describe("scheduleBlockVariant partner sleeping (PC-366)", () => {
  it("uses lighter partner variant for partner-only resolved sleeping", () => {
    expect(
      scheduleBlockVariant({
        state: "resolved",
        proposalType: "sleeping",
        isContentMasked: false,
        hasOverlap: false,
        atRisk: false,
        isPartnerOnlySleeping: true,
      }),
    ).toBe("resolved_sleeping_partner");
  });

  it("keeps normal purple for involved sleeping", () => {
    expect(
      scheduleBlockVariant({
        state: "resolved",
        proposalType: "sleeping",
        isContentMasked: false,
        hasOverlap: false,
        atRisk: false,
        isPartnerOnlySleeping: false,
      }),
    ).toBe("resolved_sleeping");
  });
});
