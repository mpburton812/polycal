import { describe, expect, it, afterEach } from "vitest";

import { decryptSecret, encryptSecret, isCalendarEncryptionConfigured } from "@/lib/calendar/crypto";

describe("calendar crypto", () => {
  const previous = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = previous;
  });

  it("round-trips secrets when key is set", () => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = "unit-test-calendar-key-please-change";
    expect(isCalendarEncryptionConfigured()).toBe(true);
    const enc = encryptSecret("refresh-token-value");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe("refresh-token-value");
  });
});
