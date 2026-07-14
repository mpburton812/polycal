import { describe, expect, it } from "vitest";

import { buildVerifyEmailLandingUrl } from "@/lib/email/verify-notification-email";

describe("buildVerifyEmailLandingUrl", () => {
  it("builds landing URL without trailing slash on base", () => {
    expect(buildVerifyEmailLandingUrl("https://polycal.example", "ev-abc")).toBe(
      "https://polycal.example/verify-email?token=ev-abc",
    );
  });

  it("strips trailing slash and encodes token", () => {
    expect(buildVerifyEmailLandingUrl("https://polycal.example/", "ev-a b")).toBe(
      "https://polycal.example/verify-email?token=ev-a%20b",
    );
  });
});
