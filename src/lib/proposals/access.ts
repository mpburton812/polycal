import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { polyGroup, type ProposalState, type ProposalType } from "@/lib/db/schema";
import type { AuditLogVisibility } from "@/types/poly-group";

export const MASKED_TITLE = "Private event";
export const MASKED_DESCRIPTION = "Details are hidden for this privacy level.";

/**
 * Generic content redaction — used when sleeping-network visibility (PC-229)
 * hides a proposal's details from a non-participant viewer.
 */
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

/**
 * Sleeping network visibility is hard-defaulted to "involved" — only proposer,
 * invitees, and (when allowed) admins can see sleeping proposals (PC-280).
 */
export async function getSleepingNetworkVisibility(): Promise<"involved"> {
  return "involved";
}

/** Whether the viewer may see a proposal in a non-draft column. */
export function viewerCanSeeProposal(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  context?: {
    state?: ProposalState;
    /** When false, admins must be proposer or invitee (PC-274). Default true. */
    adminCanSeeUninvolved?: boolean;
  },
): boolean {
  const adminSeesAll = isAdmin && context?.adminCanSeeUninvolved !== false;
  if (adminSeesAll) return true;
  if (proposerId === viewerId) return true;
  if (inviteeUserIds.includes(viewerId)) return true;
  if (context?.state === "resolved") return true;
  if (context?.state === "archived") return true;
  return false;
}

/**
 * Sleeping visibility is hard-defaulted to "involved": only proposer, invitees,
 * and (when allowed) admins can see sleeping proposals — even open resolved/archived (PC-229/PC-280).
 */
export function viewerCanSeeSleepingProposal(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  options: {
    adminCanSeeUninvolved?: boolean;
  } = {},
): boolean {
  const adminSeesAll = isAdmin && options.adminCanSeeUninvolved !== false;
  if (adminSeesAll) return true;
  if (proposerId === viewerId) return true;
  if (inviteeUserIds.includes(viewerId)) return true;
  return false;
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
    state?: ProposalState;
    adminCanSeeUninvolved?: boolean;
  },
): boolean {
  if (options.proposalType === "sleeping") {
    return viewerCanSeeSleepingProposal(viewerId, isAdmin, proposerId, inviteeUserIds, {
      adminCanSeeUninvolved: options.adminCanSeeUninvolved,
    });
  }
  return viewerCanSeeProposal(viewerId, isAdmin, proposerId, inviteeUserIds, {
    state: options.state,
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
