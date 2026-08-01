import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { hashLinkToken } from "./token-hash";

describe("hashLinkToken", () => {
  it("returns a stable sha256 hex digest", () => {
    const token = "pr-2f3a4b5c-6d7e-8f90-1234-56789abcdef0";
    const expected = createHash("sha256").update(token, "utf8").digest("hex");

    expect(hashLinkToken(token)).toBe(expected);
    expect(hashLinkToken(token)).toHaveLength(64);
    expect(hashLinkToken(token)).toBe(hashLinkToken(token));
  });

  it("never returns the raw token", () => {
    const token = "ev-secret-token";
    expect(hashLinkToken(token)).not.toContain(token);
  });

  it("distinguishes different tokens", () => {
    expect(hashLinkToken("pr-one")).not.toBe(hashLinkToken("pr-two"));
  });

  it("ignores surrounding whitespace so mailed links round-trip", () => {
    expect(hashLinkToken("  ev-token \n")).toBe(hashLinkToken("ev-token"));
  });
});
