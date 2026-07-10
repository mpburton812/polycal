import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEWER_TIMEZONE,
  resolveTimezone,
} from "./timezone";

describe("resolveTimezone", () => {
  it("defaults to US Eastern when timezone is unset", () => {
    expect(resolveTimezone(null)).toBe(DEFAULT_VIEWER_TIMEZONE);
    expect(resolveTimezone(undefined)).toBe(DEFAULT_VIEWER_TIMEZONE);
    expect(resolveTimezone("")).toBe(DEFAULT_VIEWER_TIMEZONE);
    expect(resolveTimezone("   ")).toBe(DEFAULT_VIEWER_TIMEZONE);
  });

  it("preserves an explicitly set valid timezone", () => {
    expect(resolveTimezone("UTC")).toBe("UTC");
    expect(resolveTimezone("America/Chicago")).toBe("America/Chicago");
    expect(resolveTimezone("Europe/London")).toBe("Europe/London");
  });

  it("falls back to UTC for invalid IANA identifiers", () => {
    expect(resolveTimezone("Not/A_Timezone")).toBe("UTC");
  });
});
