import type { NetworkMemberRole, NetworkStatus } from "@/types/network";

/**
 * Network-admin-equivalent elevation. Sponsor is a distinct membership role that
 * still unlocks the Admin tab and the same gates as network_admin (PC-460).
 */
export function isElevatedNetworkRole(
  role: NetworkMemberRole | string | null | undefined,
): boolean {
  return role === "sponsor" || role === "network_admin";
}

/** True when the membership is the unique network Sponsor (PC-460). */
export function isSponsorRole(
  role: NetworkMemberRole | string | null | undefined,
): boolean {
  return role === "sponsor";
}

/**
 * Whether a member may keep using a paused or pending-delete network.
 * Paused: Sponsor and Network Admin. Closing: Sponsor only. Platform operators
 * always pass (PC-462).
 */
export function canAccessRestrictedNetwork(input: {
  role: NetworkMemberRole | string | null | undefined;
  networkStatus: NetworkStatus | string | null | undefined;
  isPlatformAdmin?: boolean;
}): boolean {
  if (input.networkStatus === "active" || !input.networkStatus) return true;
  if (input.isPlatformAdmin === true) return true;
  if (input.networkStatus === "paused") {
    return isElevatedNetworkRole(input.role);
  }
  if (input.networkStatus === "pending_delete") {
    return isSponsorRole(input.role);
  }
  return false;
}

export type SponsorBackfillMember = {
  userId: string;
  status: string;
  createdAt: string;
  role?: string;
};

/**
 * Picks the Sponsor for an existing network: creator if still an active member,
 * otherwise the earliest active membership. Timestamp ties prefer an elevated
 * role then userId so seed data lands on Luke (PC-460).
 */
export function pickSponsorUserId(input: {
  createdByUserId: string | null | undefined;
  members: SponsorBackfillMember[];
}): string | null {
  const active = input.members.filter((member) => member.status === "active");
  if (
    input.createdByUserId &&
    active.some((member) => member.userId === input.createdByUserId)
  ) {
    return input.createdByUserId;
  }
  const rank = (role?: string) =>
    role === "sponsor" || role === "network_admin" ? 0 : 1;
  const sorted = [...active].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    if (byTime !== 0) return byTime;
    const byRole = rank(a.role) - rank(b.role);
    if (byRole !== 0) return byRole;
    return a.userId.localeCompare(b.userId);
  });
  return sorted[0]?.userId ?? null;
}
