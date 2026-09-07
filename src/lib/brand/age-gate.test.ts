import { describe, expect, it } from "vitest";

import { ageFromBirthdateParts, isAdultBirthdate } from "@/lib/brand/age-gate";

describe("age-gate (PC-494)", () => {
  const asOf = new Date(2026, 8, 7); // Sep 7, 2026

  it("accepts an 18th birthday on or before asOf", () => {
    expect(isAdultBirthdate(2008, 9, 7, asOf)).toBe(true);
    expect(isAdultBirthdate(2008, 9, 8, asOf)).toBe(false);
    expect(ageFromBirthdateParts(2008, 9, 7, asOf)).toBe(18);
  });

  it("rejects invalid civil dates", () => {
    expect(ageFromBirthdateParts(2000, 2, 30, asOf)).toBeNull();
    expect(isAdultBirthdate(2000, 13, 1, asOf)).toBe(false);
  });
});
