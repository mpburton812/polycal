import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  polyGroup,
  type EventPrivacyLevel,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import type {
  AuditLogVisibility,
  SleepingNetworkVisibility,
} from "@/types/poly-group";

export const MASKED_TITLE = "Private event";
export const MASKED_DESCRIPTION = "Details are hidden for this privacy level.";

/** Poly-group admin visibility toggles for private proposals (PC-40). */
export async function getPrivacyAdminFlags(
  db: ReturnType<typeof getDb> = getDb(),
): Promise<{ adminCanSeePrivate: boolean; adminCanSeeSuperPrivate: boolean }> {
  const [group] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  return {
    adminCanSeePrivate: group?.adminCanSeePrivate ?? false,
    adminCanSeeSuperPrivate: group?.adminCanSeeSuperPrivate ?? false,
  };
}

/**
 * Whether admins see proposals they are not proposer/invitee for (PC-274).
 * Defaults to true (legacy behavior) when unset.
 */
export async function getAdminCanSeeUninvolved(
  db: ReturnType<typeof getDb> = getDb(),
): Promise<boolean> {
  const [group] = await db
    .select({ adminCanSeeUninvolved: polyGroup.adminCanSeeUninvolved })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  return group?.adminCanSeeUninvolved ?? true;
}

/** Loads sleeping network visibility (everyone vs involved) from poly group (PC-229). */
export async function getSleepingNetworkVisibility(
  db: ReturnType<typeof getDb> = getDb(),
): Promise<SleepingNetworkVisibility> {
  const [group] = await db
    .select({ sleepingNetworkVisibility: polyGroup.sleepingNetworkVisibility })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  const value = group?.sleepingNetworkVisibility;
  return value === "involved" ? "involved" : "everyone";
}

/**
 * Whether resolved/archived card content should be masked for the viewer (PC-40).
 */
export function shouldMaskProposalContent(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  eventPrivacy: EventPrivacyLevel,
  adminCanSeePrivate: boolean,
  adminCanSeeSuperPrivate: boolean,
  state: ProposalState,
): boolean {
  if (state !== "resolved" && state !== "archived") return false;
  if (eventPrivacy === "open") return false;
  if (proposerId === viewerId || inviteeUserIds.includes(viewerId)) return false;
  if (eventPrivacy === "private" && isAdmin && adminCanSeePrivate) return false;
  if (eventPrivacy === "super_private" && isAdmin && adminCanSeeSuperPrivate) return false;
  return true;
}

export function applyProposalMask<
  T extends {
    title: string;
    description: string | null;
    locationName: string | null;
    locationText?: string | null;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    notes?: string | null;
  },
>(row: T, masked: boolean): T {
  if (!masked) return row;
  return {
    ...row,
    title: MASKED_TITLE,
    description: MASKED_DESCRIPTION,
    locationName: null,
    locationText: row.locationText !== undefined ? null : undefined,
    scheduledStartAt: null,
    scheduledEndAt: null,
    notes: row.notes !== undefined ? null : undefined,
  };
}

/** Whether the viewer may see a proposal in a non-draft column. */
export function viewerCanSeeProposal(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  context?: {
    state?: ProposalState;
    eventPrivacy?: EventPrivacyLevel;
    /** When false, admins must be proposer or invitee (PC-274). Default true. */
    adminCanSeeUninvolved?: boolean;
  },
): boolean {
  const adminSeesAll = isAdmin && context?.adminCanSeeUninvolved !== false;
  if (adminSeesAll) return true;
  if (proposerId === viewerId) return true;
  if (inviteeUserIds.includes(viewerId)) return true;
  if (context?.state === "resolved" && context.eventPrivacy === "open") return true;
  if (context?.state === "archived" && context.eventPrivacy === "open") return true;
  return false;
}

/**
 * Sleeping visibility when `sleepingNetworkVisibility` is `involved`:
 * only proposer, invitees, and (when allowed) admins — even for open resolved/archived (PC-229).
 */
export function viewerCanSeeSleepingProposal(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  options: {
    sleepingNetworkVisibility: SleepingNetworkVisibility;
    state?: ProposalState;
    eventPrivacy?: EventPrivacyLevel;
    adminCanSeeUninvolved?: boolean;
  },
): boolean {
  if (options.sleepingNetworkVisibility === "involved") {
    const adminSeesAll = isAdmin && options.adminCanSeeUninvolved !== false;
    if (adminSeesAll) return true;
    if (proposerId === viewerId) return true;
    if (inviteeUserIds.includes(viewerId)) return true;
    return false;
  }
  return viewerCanSeeProposal(viewerId, isAdmin, proposerId, inviteeUserIds, {
    state: options.state,
    eventPrivacy: options.eventPrivacy,
    adminCanSeeUninvolved: options.adminCanSeeUninvolved,
  });
}

/**
 * Applies standard proposal visibility, with the sleeping network gate when type is sleeping.
 */
export function viewerCanSeeProposalWithSleepingGate(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  options: {
    proposalType: ProposalType;
    sleepingNetworkVisibility: SleepingNetworkVisibility;
    state?: ProposalState;
    eventPrivacy?: EventPrivacyLevel;
    adminCanSeeUninvolved?: boolean;
  },
): boolean {
  if (options.proposalType === "sleeping") {
    return viewerCanSeeSleepingProposal(viewerId, isAdmin, proposerId, inviteeUserIds, {
      sleepingNetworkVisibility: options.sleepingNetworkVisibility,
      state: options.state,
      eventPrivacy: options.eventPrivacy,
      adminCanSeeUninvolved: options.adminCanSeeUninvolved,
    });
  }
  return viewerCanSeeProposal(viewerId, isAdmin, proposerId, inviteeUserIds, {
    state: options.state,
    eventPrivacy: options.eventPrivacy,
    adminCanSeeUninvolved: options.adminCanSeeUninvolved,
  });
}

/** Whether the viewer may see proposal audit / feed milestone lines (PC-45 / PC-226). */
export function viewerCanSeeAuditLog(
  visibility: AuditLogVisibility | string,
  isAdmin: boolean,
  isProposer: boolean,
  isInvitee: boolean,
): boolean {
  if (visibility === "everyone") return true;
  if (visibility === "admin_only") return isAdmin;
  if (visibility === "proposer_admin") return isAdmin || isProposer;
  if (visibility === "invitees_proposer_admin") return isAdmin || isProposer || isInvitee;
  return isAdmin;
}
