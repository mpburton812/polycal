import { auth } from "@/lib/auth";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  getMembership,
  listActiveMemberships,
  type MembershipRow,
} from "@/lib/networks/membership";
import type { NetworkMemberRole } from "@/types/network";
import type { UserRole } from "@/types/user";
import { canAccessRestrictedNetwork, isElevatedNetworkRole } from "@/lib/networks/roles";
import {
  PAUSED_ACCOUNT_MESSAGE,
  type ActionContextError,
  type SessionUser,
} from "@/lib/actions/context";

export interface NetworkSessionUser extends SessionUser {
  activeNetworkId: string;
  activeNetworkRole: NetworkMemberRole;
  isPlatformAdmin: boolean;
  networkName: string;
}

export const NETWORK_PAUSED_MESSAGE =
  "This network is paused. Contact a network admin or platform operator.";

export const NETWORK_CLOSING_MESSAGE =
  "This network is closing. Contact the Sponsor or a platform operator.";

/**
 * Requires session + active network membership. Paused networks reject
 * non-elevated members; pending-delete rejects everyone except the Sponsor
 * (and platform operators) (PC-357 / PC-359 / PC-462).
 */
export async function requireNetworkSession(): Promise<
  { ok: true; user: NetworkSessionUser; membership: MembershipRow } | ActionContextError
> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Sign in required." };
  }
  if (session.user.accountStatus === "paused") {
    return { ok: false, message: PAUSED_ACCOUNT_MESSAGE };
  }
  if (session.user.accountStatus === "banned") {
    return { ok: false, message: "Your account has been banned." };
  }

  const memberships = await listActiveMemberships(session.user.id);
  if (memberships.length === 0) {
    return { ok: false, message: "You are not a member of any network." };
  }

  const preferredId =
    typeof session.user.activeNetworkId === "string"
      ? session.user.activeNetworkId
      : null;
  let membership =
    (preferredId
      ? memberships.find((m) => m.networkId === preferredId)
      : undefined) ?? memberships[0];

  if (
    !canAccessRestrictedNetwork({
      role: membership.role,
      networkStatus: membership.networkStatus,
      isPlatformAdmin: session.user.isPlatformAdmin === true,
    })
  ) {
    const fallback = memberships.find((m) =>
      canAccessRestrictedNetwork({
        role: m.role,
        networkStatus: m.networkStatus,
        isPlatformAdmin: session.user.isPlatformAdmin === true,
      }),
    );
    if (!fallback) {
      return {
        ok: false,
        message:
          membership.networkStatus === "pending_delete"
            ? NETWORK_CLOSING_MESSAGE
            : NETWORK_PAUSED_MESSAGE,
      };
    }
    membership = fallback;
  }

  return {
    ok: true,
    membership,
    user: {
      id: session.user.id,
      role: session.user.role as UserRole,
      isImpersonating: session.user.isImpersonating === true,
      activeNetworkId: membership.networkId,
      activeNetworkRole: membership.role,
      isPlatformAdmin: session.user.isPlatformAdmin === true,
      networkName: membership.networkName,
    },
  };
}

/**
 * Requires network_admin or sponsor (or platform admin) in the active network (PC-357 / PC-460).
 */
export async function requireNetworkAdmin(): Promise<
  { ok: true; user: NetworkSessionUser; membership: MembershipRow } | ActionContextError
> {
  const result = await requireNetworkSession();
  if (!result.ok) return result;
  if (
    !isElevatedNetworkRole(result.user.activeNetworkRole) &&
    !result.user.isPlatformAdmin
  ) {
    return { ok: false, message: "Network admin access required." };
  }
  return result;
}

/**
 * Requires the unique Sponsor membership. Platform admin is not enough unless
 * they are also this network's Sponsor — only Sponsor may start DELETE (PC-460 / PC-462).
 */
export async function requireNetworkSponsor(): Promise<
  { ok: true; user: NetworkSessionUser; membership: MembershipRow } | ActionContextError
> {
  const result = await requireNetworkSession();
  if (!result.ok) return result;
  if (result.user.activeNetworkRole !== "sponsor") {
    return { ok: false, message: "Sponsor access required." };
  }
  return result;
}

/**
 * Requires platform admin flag (PC-357 / PC-362).
 */
export async function requirePlatformAdmin(): Promise<
  { ok: true; user: NetworkSessionUser } | ActionContextError
> {
  const result = await requireNetworkSession();
  if (!result.ok) {
    // Platform admins might have no network — allow via raw session check.
    await ensureDbReady();
    const session = await auth();
    if (session?.user?.id && session.user.isPlatformAdmin === true) {
      return {
        ok: true,
        user: {
          id: session.user.id,
          role: session.user.role as UserRole,
          isImpersonating: session.user.isImpersonating === true,
          activeNetworkId: session.user.activeNetworkId ?? "",
          activeNetworkRole: "network_admin",
          isPlatformAdmin: true,
          networkName: "Platform",
        },
      };
    }
    return result;
  }
  if (!result.user.isPlatformAdmin) {
    return { ok: false, message: "Platform admin access required." };
  }
  return { ok: true, user: result.user };
}

/**
 * True when the user may administer the active network.
 */
export async function isActiveNetworkAdmin(
  userId: string,
  networkId: string,
  _legacyRole: UserRole,
  isPlatformAdmin: boolean,
): Promise<boolean> {
  if (isPlatformAdmin) return true;
  const membership = await getMembership(userId, networkId);
  return isElevatedNetworkRole(membership?.role);
}
