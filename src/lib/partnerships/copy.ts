/**
 * Kanban/detail copy for sleeping partnership proposals (PC-50).
 */
export function buildPartnershipProposalCopy(params: {
  viewerId: string;
  userLowId: string;
  userHighId: string;
  proposedById: string;
  proposerName: string;
  initiatedByName: string | null;
  partnerName: string;
  lowName: string;
  highName: string;
}): { description: string; needsViewerAction: boolean; proposerDisplayName: string } {
  const {
    viewerId,
    userLowId,
    userHighId,
    proposedById,
    proposerName,
    initiatedByName,
    partnerName,
    lowName,
    highName,
  } = params;

  const viewerInPair = viewerId === userLowId || viewerId === userHighId;
  const proposerInPair = proposedById === userLowId || proposedById === userHighId;
  const initiatorName =
    initiatedByName && initiatedByName !== proposerName ? initiatedByName : null;
  const actorName = initiatorName ?? proposerName;

  if (!viewerInPair) {
    return {
      description: `${actorName} proposed a sleeping partnership between ${lowName} and ${highName}.`,
      needsViewerAction: false,
      proposerDisplayName: actorName,
    };
  }

  if (viewerId === proposedById) {
    const viaAdmin = initiatorName ? ` Submitted by ${initiatorName}.` : "";
    return {
      description: `You proposed a sleeping partnership with ${partnerName}. Awaiting their response.${viaAdmin}`,
      needsViewerAction: false,
      proposerDisplayName: initiatorName ?? proposerName,
    };
  }

  if (proposerInPair) {
    const viaAdmin = initiatorName ? ` (initiated by ${initiatorName})` : "";
    return {
      description: `${proposerName} proposed a sleeping partnership with you.${viaAdmin}`,
      needsViewerAction: true,
      proposerDisplayName: initiatorName ?? proposerName,
    };
  }

  return {
    description: `${actorName} proposed a sleeping partnership between you and ${partnerName}.`,
    needsViewerAction: true,
    proposerDisplayName: actorName,
  };
}
