/**
 * True when a feed milestone is visible to the viewer only because they are an
 * admin (PC-250) — e.g. sleeping proposals under involved-only network visibility,
 * or audit-log milestones restricted to admins.
 */
export function isFeedMilestoneVisibleViaAdminOnly(params: {
  isAdmin: boolean;
  nonAdminWouldSeeProposal: boolean;
  nonAdminWouldSeeAudit: boolean;
}): boolean {
  if (!params.isAdmin) return false;
  return !(params.nonAdminWouldSeeProposal && params.nonAdminWouldSeeAudit);
}
