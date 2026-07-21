import { afterEach, describe, expect, it, vi } from "vitest";

import {
  alphaFeedbackCorsHeaders,
  resolveAlphaFeedbackAllowOrigin,
} from "./cors";

describe("alpha-feedback CORS (PC-282)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reflects origin outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "dev");
    const request = new Request("https://api.example/login", {
      headers: { origin: "http://localhost:1420" },
    });
    expect(resolveAlphaFeedbackAllowOrigin(request)).toBe("http://localhost:1420");
  });

  it("allows tracker localhost in production even without env allowlist", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("ALPHA_FEEDBACK_CORS_ORIGINS", "");
    const request = new Request("https://api.example/login", {
      headers: { origin: "http://localhost:1420" },
    });
    expect(resolveAlphaFeedbackAllowOrigin(request)).toBe("http://localhost:1420");
  });

  it("allows env-listed origins in production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("ALPHA_FEEDBACK_CORS_ORIGINS", "https://tracker.example.com, https://other.test");
    const request = new Request("https://api.example/login", {
      headers: { origin: "https://tracker.example.com" },
    });
    expect(resolveAlphaFeedbackAllowOrigin(request)).toBe("https://tracker.example.com");
  });

  it("rejects unknown origins in production without ACAO", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("ALPHA_FEEDBACK_CORS_ORIGINS", "https://tracker.example.com");
    const request = new Request("https://api.example/login", {
      headers: { origin: "https://evil.example" },
    });
    expect(resolveAlphaFeedbackAllowOrigin(request)).toBeUndefined();
    const headers = alphaFeedbackCorsHeaders(request) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
