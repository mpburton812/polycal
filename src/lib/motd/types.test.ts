import { describe, expect, it } from "vitest";

import {
  MOTD_MAX_BODY_LENGTH,
  normalizeMotdBody,
  parseOptionalEndsAt,
} from "@/lib/motd/types";

describe("normalizeMotdBody", () => {
  it("trims and collapses whitespace", () => {
    const result = normalizeMotdBody("  hello   world  ");
    expect(result).toEqual({ ok: true, body: "hello world" });
  });

  it("rejects empty", () => {
    expect(normalizeMotdBody("   ").ok).toBe(false);
  });

  it("rejects over max length", () => {
    const result = normalizeMotdBody("x".repeat(MOTD_MAX_BODY_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it("accepts exactly max length", () => {
    const body = "x".repeat(MOTD_MAX_BODY_LENGTH);
    expect(normalizeMotdBody(body)).toEqual({ ok: true, body });
  });
});

describe("parseOptionalEndsAt", () => {
  const now = Date.parse("2026-07-29T16:00:00.000Z");

  it("allows empty as no expiry", () => {
    expect(parseOptionalEndsAt(null, now)).toEqual({ ok: true, endsAt: null });
    expect(parseOptionalEndsAt("", now)).toEqual({ ok: true, endsAt: null });
  });

  it("rejects past times", () => {
    const result = parseOptionalEndsAt("2026-07-29T15:00:00.000Z", now);
    expect(result.ok).toBe(false);
  });

  it("accepts future ISO", () => {
    const result = parseOptionalEndsAt("2026-07-30T12:00:00.000Z", now);
    expect(result).toEqual({
      ok: true,
      endsAt: "2026-07-30T12:00:00.000Z",
    });
  });

  it("rejects invalid", () => {
    expect(parseOptionalEndsAt("not-a-date", now).ok).toBe(false);
  });
});
