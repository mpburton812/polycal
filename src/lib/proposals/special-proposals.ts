/** Metadata shape stored in proposal.description for place residency (PC-60 / PC-188). */
export interface ResidencyProposalMeta {
  residencyProposal: true;
  targetUserId: string;
  /** Linked location_residents row once submitted or resolved. */
  locationResidentsId?: string;
  /** Self-join proposals are approved by place owners. */
  kind?: "self_join";
  /** Role applied on acceptance when owners unanimously approve. */
  placeRole?: "owner" | "resident";
}

export type ProposalSpecialKind = "residency";

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
    const placeRole =
      parsed.placeRole === "owner" || parsed.placeRole === "resident"
        ? parsed.placeRole
        : undefined;
    return {
      residencyProposal: true,
      targetUserId: parsed.targetUserId.trim(),
      locationResidentsId:
        typeof parsed.locationResidentsId === "string"
          ? parsed.locationResidentsId.trim()
          : undefined,
      kind: parsed.kind === "self_join" ? "self_join" : undefined,
      placeRole,
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
 * True when a proposal does not require schedule slots or conflict checks.
 */
export function isNonScheduleProposal(description: string | null): boolean {
  return getProposalSpecialKind(description) !== null;
}

/**
 * Returns user-facing proposal description text; hides internal JSON metadata blobs (PC-68).
 */
export function proposalDescriptionForDisplay(description: string | null): string | null {
  if (!description?.trim()) return null;

  const residencyMeta = parseResidencyProposalMeta(description);
  if (residencyMeta) {
    if (residencyMeta.placeRole === "owner") {
      return "Requesting Owner access — can manage members and approve residency requests.";
    }
    if (residencyMeta.placeRole === "resident") {
      return "Requesting Resident access — can use the place but cannot manage membership.";
    }
    return "Place residency request.";
  }

  if (getProposalSpecialKind(description)) {
    return null;
  }

  return description;
}
