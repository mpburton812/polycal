/**
 * Shapes the "Download my data" payload (PC-354). Pure so the redaction contract — which
 * columns are allowed out of the database — is unit-tested rather than reviewed by eye in
 * the server action.
 */

/** Bumped when the payload shape changes, so older exports stay interpretable. */
export const ACCOUNT_EXPORT_VERSION = 1;

export interface AccountExportProfileRow {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  gender: string | null;
  profileBio: string | null;
  avatarKey: string | null;
  theme: string;
  timezone: string;
  notificationEmail: string | null;
  emailVerifiedAt: string | null;
  notificationPrefsJson: string | null;
  feedPrefsJson: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountExportProposalRow {
  id: string;
  title: string;
  proposalType: string;
  state: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  createdAt: string;
}

export interface AccountExportPartnershipRow {
  partnerDisplayName: string;
  status: string;
  proposedByYou: boolean;
  createdAt: string;
  respondedAt: string | null;
}

export interface AccountExport {
  exportVersion: number;
  generatedAt: string;
  profile: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    status: string;
    gender: string | null;
    about: string | null;
    avatarKey: string | null;
    theme: string;
    timezone: string;
    notificationEmail: string | null;
    notificationEmailVerified: boolean;
    lastLoginAt: string | null;
    loginCount: number;
    onboardingComplete: boolean;
    createdAt: string;
    updatedAt: string;
  };
  preferences: {
    notifications: unknown;
    feed: unknown;
  };
  proposals: {
    authoredCount: number;
    items: AccountExportProposalRow[];
  };
  partnerships: {
    count: number;
    items: AccountExportPartnershipRow[];
  };
}

/**
 * Parses a preference JSON column, returning null instead of throwing when a legacy row
 * holds malformed JSON — a bad preferences blob must not block a data-access request.
 */
function parseJsonColumn(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/**
 * Assembles the export document from raw rows.
 *
 * Credential material (password hash, reset/verification tokens) and encrypted calendar
 * tokens are deliberately absent: the export is a data-access artifact the member may
 * store anywhere, so it must not become a secondary credential store.
 */
export function buildAccountExport(input: {
  generatedAt: string;
  profile: AccountExportProfileRow;
  proposals: AccountExportProposalRow[];
  partnerships: AccountExportPartnershipRow[];
}): AccountExport {
  const { profile } = input;
  return {
    exportVersion: ACCOUNT_EXPORT_VERSION,
    generatedAt: input.generatedAt,
    profile: {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      role: profile.role,
      status: profile.status,
      gender: profile.gender,
      about: profile.profileBio,
      avatarKey: profile.avatarKey,
      theme: profile.theme,
      timezone: profile.timezone,
      notificationEmail: profile.notificationEmail,
      notificationEmailVerified: Boolean(profile.emailVerifiedAt),
      lastLoginAt: profile.lastLoginAt,
      loginCount: profile.loginCount,
      onboardingComplete: profile.onboardingComplete,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
    preferences: {
      notifications: parseJsonColumn(profile.notificationPrefsJson),
      feed: parseJsonColumn(profile.feedPrefsJson),
    },
    proposals: {
      authoredCount: input.proposals.length,
      items: input.proposals,
    },
    partnerships: {
      count: input.partnerships.length,
      items: input.partnerships,
    },
  };
}

/**
 * Filename for the downloaded blob, e.g. `polycal-export-luke-2026-07-25.json`.
 * The username is slugified because it reaches a `download` attribute and, on some
 * platforms, the filesystem.
 */
export function buildAccountExportFilename(username: string, generatedAt: string): string {
  const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
  const day = generatedAt.slice(0, 10);
  return `polycal-export-${slug}-${day}.json`;
}
