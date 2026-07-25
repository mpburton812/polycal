import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DELETE_CONFIRMATION_PHRASE,
  anonymizedUserFields,
  anonymizedUsernameFor,
  DELETED_DISPLAY_NAME,
  matchesDeleteConfirmation,
} from "@/lib/users/account-deletion";

describe("matchesDeleteConfirmation", () => {
  it("accepts the phrase regardless of case and padding", () => {
    expect(matchesDeleteConfirmation(ACCOUNT_DELETE_CONFIRMATION_PHRASE)).toBe(true);
    expect(matchesDeleteConfirmation("  delete my account  ")).toBe(true);
    expect(matchesDeleteConfirmation("Delete My Account")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(matchesDeleteConfirmation("delete")).toBe(false);
    expect(matchesDeleteConfirmation("delete my acount")).toBe(false);
    expect(matchesDeleteConfirmation("")).toBe(false);
    expect(matchesDeleteConfirmation(null)).toBe(false);
    expect(matchesDeleteConfirmation(undefined)).toBe(false);
  });
});

describe("anonymizedUsernameFor", () => {
  it("derives a unique placeholder from the id suffix", () => {
    expect(anonymizedUsernameFor("user-1234567890abcdef")).toBe("deleted-90abcdef");
  });

  it("tolerates ids shorter than the suffix window", () => {
    expect(anonymizedUsernameFor("abc")).toBe("deleted-abc");
  });
});

describe("anonymizedUserFields", () => {
  const fields = anonymizedUserFields({
    userId: "user-1234567890abcdef",
    sessionVersion: 4,
    passwordHash: "$2a$12$unusable",
    now: "2026-07-25T10:00:00.000Z",
  });

  it("marks the row deleted and replaces identifying names", () => {
    expect(fields.status).toBe("deleted");
    expect(fields.displayName).toBe(DELETED_DISPLAY_NAME);
    expect(fields.username).toBe("deleted-90abcdef");
  });

  it("clears every profile-authored field", () => {
    expect(fields.gender).toBeNull();
    expect(fields.profileBio).toBeNull();
    expect(fields.avatarKey).toBeNull();
    expect(fields.notificationPrefsJson).toBeNull();
    expect(fields.feedPrefsJson).toBeNull();
    expect(fields.notificationEmail).toBeNull();
    expect(fields.emailVerifiedAt).toBeNull();
  });

  it("clears outstanding credential tokens so stale links cannot be replayed", () => {
    expect(fields.emailVerificationToken).toBeNull();
    expect(fields.emailVerificationTokenExpiresAt).toBeNull();
    expect(fields.passwordResetToken).toBeNull();
    expect(fields.passwordResetTokenExpiresAt).toBeNull();
  });

  it("bumps sessionVersion to invalidate in-flight JWTs", () => {
    expect(fields.sessionVersion).toBe(5);
  });

  it("keeps the supplied unusable password hash and timestamp", () => {
    expect(fields.passwordHash).toBe("$2a$12$unusable");
    expect(fields.updatedAt).toBe("2026-07-25T10:00:00.000Z");
  });
});
