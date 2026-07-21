/** How group name changes may be proposed (spec §2). */
export const groupNameChangeModes = [
  "admin_only",
  "mandatory_consensus",
  "plurality",
  "auto",
] as const;
export type GroupNameChangeMode = (typeof groupNameChangeModes)[number];

export const powerManagementModes = ["admin_user", "all_admin"] as const;
export type PowerManagementMode = (typeof powerManagementModes)[number];

export const auditLogVisibilityLevels = [
  "everyone",
  "invitees_proposer_admin",
  "proposer_admin",
  "admin_only",
] as const;
export type AuditLogVisibility = (typeof auditLogVisibilityLevels)[number];

export const placesMapVisibilityLevels = ["all", "admins", "none"] as const;
export type PlacesMapVisibility = (typeof placesMapVisibilityLevels)[number];

/** Whether sleeping proposals/arrangements are network-wide or involved-only (PC-229). */
export const sleepingNetworkVisibilityLevels = ["everyone", "involved"] as const;
export type SleepingNetworkVisibility = (typeof sleepingNetworkVisibilityLevels)[number];

export interface PolyGroupSettings {
  name: string;
  allowGroupNameProposals: boolean;
  groupNameChangeMode: GroupNameChangeMode;
  powerManagementMode: PowerManagementMode;
  eventPrivacyOpen: boolean;
  eventPrivacyPrivate: boolean;
  eventPrivacySuperPrivate: boolean;
  adminCanSeePrivate: boolean;
  adminCanSeeSuperPrivate: boolean;
  /** When false, admins only see proposals they proposed or are invited to (PC-274). */
  adminCanSeeUninvolved: boolean;
  auditLogVisibility: AuditLogVisibility;
  allowUserProvisioning: boolean;
  hideSleepingArrangements: boolean;
  /** Orthogonal to hideSleepingArrangements — board/schedule/feed visibility for sleeping. */
  sleepingNetworkVisibility: SleepingNetworkVisibility;
  placesMapVisibility: PlacesMapVisibility;
  logTailLength: number;
  onboardingWelcomeMessage: string;
  /** Days in Proposed before return to Draft; 0 = only when event start passes (PC-273). */
  proposedMaxDays: number;
  /** Days an at-risk draft stays editable before archive (PC-273). */
  atRiskTtlDays: number;
  archiveGraceHours: number;
  redraftDeadlineHours: number;
  /** Days before unanswered sleeping-partner proposals are deleted (PC-273). */
  sleepingPartnerProposalMaxDays: number;
}

export const DEFAULT_ONBOARDING_WELCOME_MESSAGE =
  "Welcome! You are now able to view the group schedule and make schedule proposals! If you have sleeping partners, once they approve, you will be able to view and propose sleeping arrangements with them.";
