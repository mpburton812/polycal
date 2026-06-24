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
}
