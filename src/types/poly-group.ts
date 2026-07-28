export const auditLogVisibilityLevels = [
  "everyone",
  "invitees_proposer_admin",
  "proposer_admin",
  "admin_only",
] as const;
export type AuditLogVisibility = (typeof auditLogVisibilityLevels)[number];

export const placesMapVisibilityLevels = ["all", "admins", "none"] as const;
export type PlacesMapVisibility = (typeof placesMapVisibilityLevels)[number];

export interface PolyGroupSettings {
  name: string;
  /** When false, admins only see proposals they proposed or are invited to (PC-274). */
  adminCanSeeUninvolved: boolean;
  auditLogVisibility: AuditLogVisibility;
  allowUserProvisioning: boolean;
  hideSleepingArrangements: boolean;
  /**
   * When true, members see sleeping nights where an accepted partner is involved
   * and they are not (PC-366). Orthogonal to hideSleepingArrangements (Busy mask).
   */
  seePartnersSleepingArrangements: boolean;
  /** When false, FastSleep is hidden and create is rejected (PC-378). Default true. */
  fastSleepEnabled: boolean;
  /** When false, Feed tab and feed actions are disabled (PC-385). Default true. */
  feedEnabled: boolean;
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
