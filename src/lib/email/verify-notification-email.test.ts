import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: vi.fn((_column: unknown, value: unknown) => ({ value })) };
});

vi.mock("@/lib/audit", () => ({
  logUserActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/ensure-ready", () => ({
  ensureDbReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { hashLinkToken } from "@/lib/crypto/token-hash";
import { getDb } from "@/lib/db/client";
import {
  buildVerifyEmailLandingUrl,
  verifyNotificationEmailToken,
} from "@/lib/email/verify-notification-email";

/** Captures the value each `where(eq(...))` was called with, and returns no rows. */
function mockDbCapturingLookups(lookups: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: (condition: { value: unknown }) => {
          lookups.push(condition.value);
          return { limit: async () => [] };
        },
      }),
    }),
  };
}

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

describe("verifyNotificationEmailToken", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("looks the user up by token digest, never the raw token (PC-353)", async () => {
    const lookups: unknown[] = [];
    vi.mocked(getDb).mockReturnValue(
      mockDbCapturingLookups(lookups) as unknown as ReturnType<typeof getDb>,
    );

    const rawToken = "ev-11111111-2222-3333-4444-555555555555";
    const outcome = await verifyNotificationEmailToken({
      token: rawToken,
      clientKey: "test-digest-lookup",
    });

    expect(outcome).toBe("invalid_or_expired");
    expect(lookups).toEqual([hashLinkToken(rawToken)]);
    expect(lookups).not.toContain(rawToken);
  });

  it("returns missing for an absent token without touching the database", async () => {
    expect(await verifyNotificationEmailToken({ token: "  " })).toBe("missing");
    expect(getDb).not.toHaveBeenCalled();
  });
});
