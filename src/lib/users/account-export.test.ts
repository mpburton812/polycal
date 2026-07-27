import { describe, expect, it } from "vitest";

import {
  ACCOUNT_EXPORT_VERSION,
  buildAccountExport,
  buildAccountExportFilename,
  type AccountExportProfileRow,
} from "@/lib/users/account-export";

const profile: AccountExportProfileRow = {
  id: "user-1",
  username: "luke",
  displayName: "Luke Skywalker",
  role: "user",
  status: "active",
  gender: "male",
  profileBio: "Moisture farmer.",
  avatarKey: "bird_blue",
  theme: "mint",
  timezone: "America/New_York",
  notificationEmail: "luke@example.com",
  emailVerifiedAt: "2026-07-01T00:00:00.000Z",
  notificationPrefsJson: '{"globalEnabled":true}',
  feedPrefsJson: null,
  lastLoginAt: "2026-07-24T00:00:00.000Z",
  loginCount: 12,
  onboardingComplete: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

describe("buildAccountExport", () => {
  const result = buildAccountExport({
    generatedAt: "2026-07-25T10:00:00.000Z",
    profile,
    proposals: [
      {
        id: "prop-1",
        title: "Dinner",
        proposalType: "event",
        state: "resolved",
        scheduledStartAt: "2026-07-26T18:00:00.000Z",
        scheduledEndAt: "2026-07-26T20:00:00.000Z",
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    partnerships: [
      {
        partnerDisplayName: "Leia Organa",
        status: "accepted",
        proposedByYou: true,
        createdAt: "2026-02-01T00:00:00.000Z",
        respondedAt: "2026-02-02T00:00:00.000Z",
      },
    ],
  });

  it("stamps the version and generation time", () => {
    expect(result.exportVersion).toBe(ACCOUNT_EXPORT_VERSION);
    expect(result.generatedAt).toBe("2026-07-25T10:00:00.000Z");
  });

  it("includes profile fields with verification collapsed to a boolean", () => {
    expect(result.profile.username).toBe("luke");
    expect(result.profile.about).toBe("Moisture farmer.");
    expect(result.profile.notificationEmailVerified).toBe(true);
  });

  it("omits credential material", () => {
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/passwordHash/i);
    expect(serialized).not.toMatch(/Token/);
  });

  it("parses preference JSON columns", () => {
    expect(result.preferences.notifications).toEqual({ globalEnabled: true });
    expect(result.preferences.feed).toBeNull();
  });

  it("summarizes proposals and partnerships with counts", () => {
    expect(result.proposals.authoredCount).toBe(1);
    expect(result.proposals.items[0]?.title).toBe("Dinner");
    expect(result.partnerships.count).toBe(1);
    expect(result.partnerships.items[0]?.partnerDisplayName).toBe("Leia Organa");
  });

  it("falls back to null when a preference column holds malformed JSON", () => {
    const broken = buildAccountExport({
      generatedAt: "2026-07-25T10:00:00.000Z",
      profile: { ...profile, notificationPrefsJson: "{not json" },
      proposals: [],
      partnerships: [],
    });
    expect(broken.preferences.notifications).toBeNull();
  });
});

describe("buildAccountExportFilename", () => {
  it("slugifies the username and dates the file", () => {
    expect(buildAccountExportFilename("Luke.Skywalker", "2026-07-25T10:00:00.000Z")).toBe(
      "polycal-export-luke-skywalker-2026-07-25.json",
    );
  });

  it("falls back when the username has no usable characters", () => {
    expect(buildAccountExportFilename("!!!", "2026-07-25T10:00:00.000Z")).toBe(
      "polycal-export-account-2026-07-25.json",
    );
  });
});
