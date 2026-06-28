/** Metadata shape stored in proposal.description for place residency (PC-60). */
export interface ResidencyProposalMeta {
  residencyProposal: true;
  targetUserId: string;
  /** Linked location_residents row once submitted or resolved. */
  locationResidentsId?: string;
}

/** Metadata shape stored in proposal.description for poly group rename (PC-45/PC-60). */
export interface GroupNameProposalMeta {
  groupNameProposal: true;
  proposedName: string;
  previousName: string;
}

export type ProposalSpecialKind = "residency" | "group_name";

/**
 * Parses residency metadata from a proposal description JSON blob.
 */
export function parseResidencyProposalMeta(
  description: string | null,
): ResidencyProposalMeta | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description) as Partial<ResidencyProposalMeta>;
    if (parsed.residencyProposal !== true) return null;
    if (typeof parsed.targetUserId !== "string" || !parsed.targetUserId.trim()) return null;
    return {
      residencyProposal: true,
      targetUserId: parsed.targetUserId.trim(),
      locationResidentsId:
        typeof parsed.locationResidentsId === "string"
          ? parsed.locationResidentsId.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Parses group name change metadata from a proposal description JSON blob.
 */
export function parseGroupNameProposalMeta(
  description: string | null,
): GroupNameProposalMeta | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description) as Partial<GroupNameProposalMeta>;
    if (parsed.groupNameProposal !== true) return null;
    if (typeof parsed.proposedName !== "string" || !parsed.proposedName.trim()) return null;
    return {
      groupNameProposal: true,
      proposedName: parsed.proposedName.trim(),
      previousName:
        typeof parsed.previousName === "string" ? parsed.previousName.trim() : "",
    };
  } catch {
    return null;
  }
}

/**
 * Returns the special workflow kind for a proposal, if any.
 */
export function getProposalSpecialKind(description: string | null): ProposalSpecialKind | null {
  if (parseResidencyProposalMeta(description)) return "residency";
  if (parseGroupNameProposalMeta(description)) return "group_name";
  return null;
}

/**
 * Serializes residency metadata for storage on proposals.description.
 */
export function serializeResidencyProposalMeta(
  meta: ResidencyProposalMeta,
): string {
  return JSON.stringify(meta);
}

/**
 * Serializes group name metadata for storage on proposals.description.
 */
export function serializeGroupNameProposalMeta(
  meta: GroupNameProposalMeta,
): string {
  return JSON.stringify(meta);
}

/**
 * True when a proposal does not require schedule slots or conflict checks.
 */
export function isNonScheduleProposal(description: string | null): boolean {
  return getProposalSpecialKind(description) !== null;
}
