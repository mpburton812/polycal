/**
 * Shared rules for erasing a PolyCal account, used by both the admin delete tool and
 * self-service deletion (PC-354). Kept free of DB/session imports so the anonymization
 * contract can be unit-tested and stays identical across both entry points.
 */

/** Typed phrase a member must reproduce before self-service deletion runs. */
export const ACCOUNT_DELETE_CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

/** Display name every erased account collapses to, so group history stays readable. */
export const DELETED_DISPLAY_NAME = "Former User";

/**
 * Accepts the confirmation phrase ignoring case and surrounding whitespace — the phrase
 * exists to force deliberate intent, not to test typing precision.
 */
export function matchesDeleteConfirmation(input: string | null | undefined): boolean {
  if (typeof input !== "string") return false;
  return input.trim().toUpperCase() === ACCOUNT_DELETE_CONFIRMATION_PHRASE;
}

/**
 * Builds the placeholder username for an erased account. The id suffix keeps the value
 * unique (the column is UNIQUE) without leaking the original handle.
 */
export function anonymizedUsernameFor(userId: string): string {
  return `deleted-${userId.slice(-8)}`;
}

export interface AnonymizedUserFields {
  status: "deleted";
  displayName: string;
  username: string;
  passwordHash: string;
  gender: null;
  profileBio: null;
  avatarKey: null;
  notificationEmail: null;
  emailVerifiedAt: null;
  emailVerificationToken: null;
  emailVerificationTokenExpiresAt: null;
  passwordResetToken: null;
  passwordResetTokenExpiresAt: null;
  notificationPrefsJson: null;
  feedPrefsJson: null;
  mustChangePassword: false;
  sessionVersion: number;
  updatedAt: string;
}

/**
 * Returns the `users` column patch that erases personal content from an account.
 *
 * The row itself is soft-deleted rather than dropped because proposals, feed posts, and
 * activity logs hold foreign keys to it; blanking every profile-authored field plus the
 * outstanding credential tokens is what makes the remaining tombstone non-identifying.
 * Bumping `sessionVersion` invalidates any JWT still in flight for the account.
 */
export function anonymizedUserFields(input: {
  userId: string;
  sessionVersion: number;
  /** Random unusable hash — the column is NOT NULL and must never stay guessable. */
  passwordHash: string;
  now: string;
}): AnonymizedUserFields {
  return {
    status: "deleted",
    displayName: DELETED_DISPLAY_NAME,
    username: anonymizedUsernameFor(input.userId),
    passwordHash: input.passwordHash,
    gender: null,
    profileBio: null,
    avatarKey: null,
    notificationEmail: null,
    emailVerifiedAt: null,
    emailVerificationToken: null,
    emailVerificationTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    notificationPrefsJson: null,
    feedPrefsJson: null,
    mustChangePassword: false,
    sessionVersion: input.sessionVersion + 1,
    updatedAt: input.now,
  };
}
