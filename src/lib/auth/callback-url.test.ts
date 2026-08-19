import { describe, expect, it } from "vitest";

import {
  CALLBACK_URL_MAX_LENGTH,
  loginCallbackUrlFromRequest,
  safeInternalCallbackPath,
} from "./callback-url";

describe("safeInternalCallbackPath (PC-455)", () => {
  it("keeps a relative compose URL including the query string", () => {
    expect(safeInternalCallbackPath("/feed?compose=event&title=Brunch")).toBe(
      "/feed?compose=event&title=Brunch",
    );
  });

  it("falls back for open redirects and protocol-relative hosts", () => {
    expect(safeInternalCallbackPath("https://evil.example/phish")).toBe("/feed");
    expect(safeInternalCallbackPath("//evil.example/phish")).toBe("/feed");
    expect(safeInternalCallbackPath("/\\evil.example")).toBe("/feed");
    expect(safeInternalCallbackPath("javascript:alert(1)")).toBe("/feed");
  });

  it("falls back for empty, oversized, or control-character input", () => {
    expect(safeInternalCallbackPath("")).toBe("/feed");
    expect(safeInternalCallbackPath("   ")).toBe("/feed");
    expect(safeInternalCallbackPath(`/${"a".repeat(CALLBACK_URL_MAX_LENGTH)}`)).toBe("/feed");
    expect(safeInternalCallbackPath("/feed?compose=event\u0000")).toBe("/feed");
  });

  it("decodes a still-encoded relative path from older login links", () => {
    expect(safeInternalCallbackPath("%2Ffeed%3Fcompose%3Dnlp")).toBe("/feed?compose=nlp");
  });
});

describe("loginCallbackUrlFromRequest (PC-455)", () => {
  it("joins pathname and search for middleware login redirects", () => {
    expect(
      loginCallbackUrlFromRequest({
        pathname: "/feed",
        search: "?compose=nlp&q=Dinner%20Friday",
      }),
    ).toBe("/feed?compose=nlp&q=Dinner%20Friday");
  });

  it("uses pathname alone when there is no query", () => {
    expect(loginCallbackUrlFromRequest({ pathname: "/proposals", search: "" })).toBe(
      "/proposals",
    );
  });
});
