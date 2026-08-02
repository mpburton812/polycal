import { auth } from "@/lib/auth";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  getMembership,
  listActiveMemberships,
  type MembershipRow,
} from "@/lib/networks/membership";
import type { NetworkMemberRole } from "@/types/network";
import type { UserRole } from "@/types/user";
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

/**
 * Requires session + active network membership. Paused networks reject
 * non–network_admin members (PC-357 / PC-359).
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
    membership.networkStatus === "paused" &&
    membership.role !== "network_admin" &&
    session.user.isPlatformAdmin !== true
  ) {
    const fallback = memberships.find(
      (m) =>
        m.networkStatus === "active" ||
        m.role === "network_admin",
    );
    if (!fallback) {
      return { ok: false, message: NETWORK_PAUSED_MESSAGE };
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
 * Requires network_admin (or platform admin) in the active network (PC-357).
 */
export async function requireNetworkAdmin(): Promise<
  { ok: true; user: NetworkSessionUser; membership: MembershipRow } | ActionContextError
> {
  const result = await requireNetworkSession();
  if (!result.ok) return result;
  if (
    result.user.activeNetworkRole !== "network_admin" &&
    !result.user.isPlatformAdmin
  ) {
    return { ok: false, message: "Network admin access required." };
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
  return membership?.role === "network_admin";
}
