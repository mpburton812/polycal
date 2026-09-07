import { describe, expect, it } from "vitest";

import { formatPhoneForStorage, normalizePhoneDigits, phonesMatch } from "@/lib/brand/phone";

describe("phone helpers (PC-494)", () => {
  it("normalizes US 10-digit numbers with country code", () => {
    expect(normalizePhoneDigits("(555) 555-0100")).toBe("15555550100");
    expect(formatPhoneForStorage("555-555-0100")).toBe("+15555550100");
  });

  it("matches equivalent phone formats", () => {
    expect(phonesMatch("+1 555 555 0100", "5555550100")).toBe(true);
    expect(phonesMatch("+15555550100", "+44 7700 900123")).toBe(false);
  });
});
