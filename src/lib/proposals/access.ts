import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { polyGroup, type EventPrivacyLevel, type ProposalState } from "@/lib/db/schema";

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
  context?: { state?: ProposalState; eventPrivacy?: EventPrivacyLevel },
): boolean {
  if (isAdmin) return true;
  if (proposerId === viewerId) return true;
  if (inviteeUserIds.includes(viewerId)) return true;
  if (context?.state === "resolved" && context.eventPrivacy === "open") return true;
  if (context?.state === "archived" && context.eventPrivacy === "open") return true;
  return false;
}
