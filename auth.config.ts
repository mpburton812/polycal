import type { NextAuthConfig } from "next-auth";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";

/** Skip redundant Turso user selects within this window on warm instances (PC-144). */
const JWT_DB_REFRESH_TTL_MS = 60_000;

/**
 * Shared Auth.js config (JWT callbacks) — imported by src/lib/auth.ts on the Node runtime.
 * Credentials provider is registered in src/lib/auth.ts (Node runtime only).
 */
export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.accountStatus = user.accountStatus ?? "active";
        token.mustChangePassword = user.mustChangePassword;
        token.onboardingComplete = user.onboardingComplete;
        token.sessionVersion = user.sessionVersion;
        token.displayName = user.displayName;
        token.avatarKey = user.avatarKey;
        token.theme = user.theme;
        token.isImpersonating = user.isImpersonating === true;
        token.activeNetworkId = user.activeNetworkId;
        token.activeNetworkRole = user.activeNetworkRole;
        token.isPlatformAdmin = user.isPlatformAdmin === true;
        token.networkIds = user.networkIds ?? [];
        token.dbRefreshedAt = Date.now();
        delete token.error;
      }
      if (trigger === "update" && session?.user) {
        // Only apply fields the client explicitly sent — partial updates must not
        // clobber mustChangePassword / onboardingComplete with undefined (PC-144).
        if (typeof session.user.mustChangePassword === "boolean") {
          token.mustChangePassword = session.user.mustChangePassword;
        }
        if (typeof session.user.onboardingComplete === "boolean") {
          token.onboardingComplete = session.user.onboardingComplete;
        }
        if (session.user.displayName) {
          token.displayName = session.user.displayName;
        }
        if (session.user.avatarKey) token.avatarKey = session.user.avatarKey;
        if (session.user.theme) token.theme = session.user.theme;
        if (typeof session.user.sessionVersion === "number") {
          token.sessionVersion = session.user.sessionVersion;
        }
        if (typeof session.user.activeNetworkId === "string") {
          try {
            const { getMembership } = await import("@/lib/networks/membership");
            const membership = await getMembership(
              token.id as string,
              session.user.activeNetworkId,
            );
            if (membership) {
              token.activeNetworkId = membership.networkId;
              token.activeNetworkRole =
                session.user.activeNetworkRole ?? membership.role;
            }
          } catch {
            /* networks table may be mid-migration — ignore client switch */
          }
        }
        if (session.user.activeNetworkRole) {
          token.activeNetworkRole = session.user.activeNetworkRole;
        }
        // Force a DB re-check after client session.update (password / onboarding).
        token.dbRefreshedAt = 0;
      }

      if (token.id) {
        const refreshedAt = typeof token.dbRefreshedAt === "number" ? token.dbRefreshedAt : 0;
        // Never TTL-skip while the user still owes password change or onboarding —
        // those flags must stay in sync with Turso or the wizard never exits.
        // A paused account or a missing sessionVersion is treated the same way:
        // skipping the DB read there would let a revoked session keep working for
        // up to the TTL, which is exactly the window revocation must close (PC-353).
        const onboardedAndSettled =
          token.onboardingComplete === true && token.mustChangePassword === false;
        const revocationCheckPending =
          token.accountStatus === "paused" ||
          token.accountStatus === "banned" ||
          typeof token.sessionVersion !== "number";
        const withinTtl =
          trigger !== "update" &&
          !user &&
          onboardedAndSettled &&
          !revocationCheckPending &&
          refreshedAt > 0 &&
          Date.now() - refreshedAt < JWT_DB_REFRESH_TTL_MS;

        if (withinTtl) {
          return token;
        }

        await ensureDbReady();
        const db = getDb();
        const [row] = await db
          .select({
            status: users.status,
            sessionVersion: users.sessionVersion,
            role: users.role,
            mustChangePassword: users.mustChangePassword,
            onboardingComplete: users.onboardingComplete,
            displayName: users.displayName,
            avatarKey: users.avatarKey,
            theme: users.theme,
            isPlatformAdmin: users.isPlatformAdmin,
          })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);

        if (!row || row.status === "deleted") {
          token.error = "SessionInvalid";
          return token;
        }

        const { clearExpiredModeration } = await import("@/lib/users/moderation-db");
        const effectiveStatus = await clearExpiredModeration(token.id as string);
        if (effectiveStatus === "active") {
          row.status = "active";
        } else if (effectiveStatus) {
          row.status = effectiveStatus as typeof row.status;
        }

        if (row.sessionVersion !== token.sessionVersion) {
          token.error = "SessionInvalid";
          return token;
        }

        token.accountStatus = row.status;
        token.role = row.role;
        token.mustChangePassword = row.mustChangePassword;
        token.onboardingComplete = row.onboardingComplete;
        token.displayName = row.displayName;
        token.avatarKey = row.avatarKey ?? undefined;
        token.theme = row.theme;
        token.isPlatformAdmin = row.isPlatformAdmin === true;

        // Reconcile active network when JWT points at a wiped/recreated tenant
        // (E2E per-test reset) or membership was removed (PC-357).
        try {
          const { listActiveMemberships } = await import("@/lib/networks/membership");
          const memberships = await listActiveMemberships(token.id as string);
          const usable = memberships.filter(
            (m) => m.networkStatus === "active" || m.role === "network_admin",
          );
          const preferred =
            typeof token.activeNetworkId === "string"
              ? usable.find((m) => m.networkId === token.activeNetworkId) ??
                memberships.find((m) => m.networkId === token.activeNetworkId)
              : undefined;
          const next = preferred ?? usable[0] ?? memberships[0];
          if (next) {
            token.activeNetworkId = next.networkId;
            token.activeNetworkRole = next.role;
            token.networkIds = memberships.map((m) => m.networkId);
          } else {
            delete token.activeNetworkId;
            delete token.activeNetworkRole;
            token.networkIds = [];
          }
        } catch {
          /* networks table may be mid-migration — keep prior claims */
        }

        token.dbRefreshedAt = Date.now();
        delete token.error;
      }

      return token;
    },
    async session({ session, token }) {
      if (token.error === "SessionInvalid") {
        return { ...session, user: undefined, expires: new Date(0).toISOString() };
      }

      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user" | "passive";
        session.user.accountStatus =
          (token.accountStatus as "active" | "paused" | "banned") ?? "active";
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.onboardingComplete = token.onboardingComplete as boolean;
        session.user.displayName = token.displayName as string;
        session.user.name = token.displayName as string;
        session.user.avatarKey = token.avatarKey as string | undefined;
        session.user.theme = token.theme as string | undefined;
        session.user.isImpersonating = token.isImpersonating === true;
        session.user.activeNetworkId = token.activeNetworkId as string | undefined;
        session.user.activeNetworkRole = token.activeNetworkRole;
        session.user.isPlatformAdmin = token.isPlatformAdmin === true;
        session.user.networkIds = token.networkIds ?? [];
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
