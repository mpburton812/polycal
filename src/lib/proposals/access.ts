import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { polyGroup, type ProposalState, type ProposalType } from "@/lib/db/schema";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";
import { shouldMaskSleepingForViewer } from "@/lib/schedule/slice-auth";
import type { AuditLogVisibility } from "@/types/poly-group";

/** Title shown when sleeping details are masked on calendar/slice (PC-307). */
export const MASKED_TITLE = "Busy";
/** Body copy for masked sleeping proposals (PC-282 — privacy levels were removed in PC-280). */
export const MASKED_DESCRIPTION = "Details are hidden for this sleeping arrangement.";

/**
 * Generic content redaction — used when schedule masking hides sleeping details
 * from a viewer who can still see the proposal row (typically uninvolved admins).
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
  networkId?: string,
): Promise<boolean> {
  if (networkId) {
    const settings = await loadNetworkSettings(networkId, db);
    return settings?.adminCanSeeUninvolved ?? true;
  }
  const [group] = await db
    .select({ adminCanSeeUninvolved: polyGroup.adminCanSeeUninvolved })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  return group?.adminCanSeeUninvolved ?? true;
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

/** True when the viewer is proposer or invitee on the proposal. */
export function viewerIsInvolvedInProposal(
  viewerId: string,
  proposerId: string,
  inviteeUserIds: string[],
): boolean {
  return proposerId === viewerId || inviteeUserIds.includes(viewerId);
}

/**
 * True when an accepted sleeping partner of the viewer is the proposer or an
 * invitee, and the viewer themselves is not involved (PC-366 partner nights).
 */
export function isPartnerOnlySleepingViewer(
  viewerId: string,
  proposerId: string,
  inviteeUserIds: string[],
  acceptedPartnerIds: ReadonlySet<string>,
): boolean {
  if (viewerIsInvolvedInProposal(viewerId, proposerId, inviteeUserIds)) return false;
  if (acceptedPartnerIds.has(proposerId)) return true;
  return inviteeUserIds.some((id) => acceptedPartnerIds.has(id));
}

/**
 * Sleeping visibility is hard-defaulted to "involved": only proposer, invitees,
 * and (when allowed) admins can see sleeping proposals — even open resolved/archived (PC-229/PC-280).
 * When seePartnersSleepingArrangements is on, accepted partners of participants also see
 * nights they are not on (PC-366).
 */
export function viewerCanSeeSleepingProposal(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  options: {
    adminCanSeeUninvolved?: boolean;
    seePartnersSleepingArrangements?: boolean;
    acceptedPartnerIds?: ReadonlySet<string>;
  } = {},
): boolean {
  const adminSeesAll = isAdmin && options.adminCanSeeUninvolved !== false;
  if (adminSeesAll) return true;
  if (proposerId === viewerId) return true;
  if (inviteeUserIds.includes(viewerId)) return true;
  if (
    options.seePartnersSleepingArrangements &&
    isPartnerOnlySleepingViewer(
      viewerId,
      proposerId,
      inviteeUserIds,
      options.acceptedPartnerIds ?? new Set(),
    )
  ) {
    return true;
  }
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
    seePartnersSleepingArrangements?: boolean;
    acceptedPartnerIds?: ReadonlySet<string>;
  },
): boolean {
  if (isSleepingLikeType(options.proposalType)) {
    return viewerCanSeeSleepingProposal(viewerId, isAdmin, proposerId, inviteeUserIds, {
      adminCanSeeUninvolved: options.adminCanSeeUninvolved,
      seePartnersSleepingArrangements: options.seePartnersSleepingArrangements,
      acceptedPartnerIds: options.acceptedPartnerIds,
    });
  }
  return viewerCanSeeProposal(viewerId, isAdmin, proposerId, inviteeUserIds, {
    state: options.state,
    adminCanSeeUninvolved: options.adminCanSeeUninvolved,
  });
}

/**
 * Combined visibility + optional schedule content mask (PC-306).
 * Feed/board use `visible` only; schedule/slices pass `applyScheduleMask` for Busy redaction.
 */
export function canViewProposalContent(input: {
  viewerId: string;
  isAdmin: boolean;
  proposerId: string;
  inviteeUserIds: string[];
  proposalType: ProposalType;
  state?: ProposalState;
  adminCanSeeUninvolved?: boolean;
  applyScheduleMask?: boolean;
  hideSleeping?: boolean;
  seePartnersSleepingArrangements?: boolean;
  acceptedPartnerIds?: ReadonlySet<string>;
}): { visible: boolean; contentMasked: boolean; isPartnerOnlySleeping: boolean } {
  const visible = viewerCanSeeProposalWithSleepingGate(
    input.viewerId,
    input.isAdmin,
    input.proposerId,
    input.inviteeUserIds,
    {
      proposalType: input.proposalType,
      state: input.state,
      adminCanSeeUninvolved: input.adminCanSeeUninvolved,
      seePartnersSleepingArrangements: input.seePartnersSleepingArrangements,
      acceptedPartnerIds: input.acceptedPartnerIds,
    },
  );
  if (!visible) {
    return { visible: false, contentMasked: false, isPartnerOnlySleeping: false };
  }

  const isPartnerOnlySleeping =
    isSleepingLikeType(input.proposalType) &&
    Boolean(input.seePartnersSleepingArrangements) &&
    isPartnerOnlySleepingViewer(
      input.viewerId,
      input.proposerId,
      input.inviteeUserIds,
      input.acceptedPartnerIds ?? new Set(),
    );

  const contentMasked =
    Boolean(input.applyScheduleMask) &&
    isSleepingLikeType(input.proposalType) &&
    shouldMaskSleepingForViewer(
      input.viewerId,
      input.proposerId,
      input.inviteeUserIds,
      Boolean(input.hideSleeping),
      input.acceptedPartnerIds ?? new Set(),
    );

  return { visible: true, contentMasked, isPartnerOnlySleeping };
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
