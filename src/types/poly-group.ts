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
  auditLogVisibility: AuditLogVisibility;
  allowUserProvisioning: boolean;
  hideSleepingArrangements: boolean;
  logTailLength: number;
  onboardingWelcomeMessage: string;
  proposedMaxHours: number;
  atRiskTtlHours: number;
  archiveGraceHours: number;
  redraftDeadlineHours: number;
  recoveryMaxHours: number;
}

export const DEFAULT_ONBOARDING_WELCOME_MESSAGE =
  "Welcome! You are now able to view the group schedule and make schedule proposals! If you have sleeping partners, once they approve, you will be able to view and propose sleeping arrangements with them.";
