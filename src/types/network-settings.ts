export const auditLogVisibilityLevels = [
  "everyone",
  "invitees_proposer_admin",
  "proposer_admin",
  "admin_only",
] as const;
export type AuditLogVisibility = (typeof auditLogVisibilityLevels)[number];

export const placesMapVisibilityLevels = ["all", "admins", "none"] as const;
export type PlacesMapVisibility = (typeof placesMapVisibilityLevels)[number];

export const schedulingPostingModes = [
  "proposals_only",
  "proposals_and_bookings",
  "bookings_only",
] as const;
export type SchedulingPostingMode = (typeof schedulingPostingModes)[number];

/** Direct calendar booking (New Event Booking / Just Bookings) is allowed. */
export function bookingsEnabled(mode: SchedulingPostingMode): boolean {
  return mode !== "proposals_only";
}

/** Scheduling proposals (votes on Social/Sleeping New Event) are allowed. */
export function schedulingProposalsEnabled(mode: SchedulingPostingMode): boolean {
  return mode !== "bookings_only";
}

export const proxySchedulingScopes = ["anyone", "sleeping_partners"] as const;
export type ProxySchedulingScope = (typeof proxySchedulingScopes)[number];

export const postingKinds = ["proposal", "booking"] as const;
export type PostingKind = (typeof postingKinds)[number];

export interface NetworkSettings {
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
  /** When false, Poll is hidden on new event drafts (PC-423). Default true. */
  pollEnabled: boolean;
  /**
   * Just Proposals, Proposals and Bookings, or Just Bookings (PC-447).
   * Default proposals_only. Dual mode adds a Proposal/Booking choice; Just Bookings
   * forces booking and disables Poll.
   */
  schedulingPosting: SchedulingPostingMode;
  /** Booking-for is on whenever bookings are enabled; column kept (PC-428 / PC-447). */
  proxySchedulingEnabled: boolean;
  /** Who may appear in the on-behalf-of pulldown (PC-425). */
  proxySchedulingScope: ProxySchedulingScope;
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
