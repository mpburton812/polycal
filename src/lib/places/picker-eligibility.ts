/**
 * Pure eligibility for proposal/sleeping location pickers (PC-420).
 * A place belongs on the list when the viewer created it, or when at least one
 * accepted resident is still an active member of the current network.
 */
export function placeQualifiesForProposalPicker(input: {
  createdById: string | null;
  viewerId: string;
  acceptedResidentIds: readonly string[];
  activeMemberIds: ReadonlySet<string>;
}): boolean {
  if (input.createdById === input.viewerId) return true;
  return input.acceptedResidentIds.some((id) => input.activeMemberIds.has(id));
}
