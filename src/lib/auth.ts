import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getToken } from "next-auth/jwt";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { recordSuccessfulLogin, logUserActivity } from "@/lib/audit";
import { isValidImpersonationSecret } from "@/lib/auth/impersonation";
import { authConfig } from "../../auth.config";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users, type UserRole } from "@/lib/db/schema";
import { listActiveMemberships } from "@/lib/networks/membership";
import { checkRateLimitPersistent } from "@/lib/rate-limit";
import { canAccessRestrictedNetwork, isElevatedNetworkRole } from "@/lib/networks/roles";
import type { NetworkMemberRole } from "@/types/network";

async function networkClaimsForUser(userId: string): Promise<{
  activeNetworkId?: string;
  activeNetworkRole?: NetworkMemberRole;
  networkIds: string[];
  isPlatformAdmin: boolean;
}> {
  const db = getDb();
  const [row] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const memberships = await listActiveMemberships(userId);
  const usable = memberships.filter((m) =>
    canAccessRestrictedNetwork({
      role: m.role,
      networkStatus: m.networkStatus,
      isPlatformAdmin: row?.isPlatformAdmin === true,
    }),
  );
  const first = usable[0] ?? memberships[0];
  return {
    activeNetworkId: first?.networkId,
    activeNetworkRole: first?.role,
    networkIds: memberships.map((m) => m.networkId),
    isPlatformAdmin: row?.isPlatformAdmin === true,
  };
}

const credentialsSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

/**
 * Builds a Cookie request header from the current Next.js cookie store so
 * `getToken` can decode the existing Auth.js session JWT (PC-282).
 */
async function sessionCookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

/**
 * True when the current request already carries an admin JWT session.
 * Impersonation must not succeed with the secret alone (PC-282).
 */
async function hasAdminSessionJwt(): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  const cookieHeader = await sessionCookieHeader();
  if (!cookieHeader) return false;

  // Try both cookie name prefixes — AUTH_URL may be unset while cookies are
  // already `__Secure-authjs.session-token` on HTTPS deployments.
  for (const secureCookie of [true, false] as const) {
    const token = await getToken({
      req: { headers: { cookie: cookieHeader } },
      secret,
      secureCookie,
    });
    if (
      token?.role === "admin" ||
      isElevatedNetworkRole(token?.activeNetworkRole) ||
      token?.isPlatformAdmin === true
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Auth.js entry — JWT sessions in HttpOnly cookies (no localStorage tokens).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        impersonateUserId: { label: "Impersonate", type: "text" },
        impersonateSecret: { label: "Impersonate secret", type: "password" },
        emailLoginToken: { label: "Email login token", type: "text" },
      },
      async authorize(raw) {
        await ensureDbReady();

        if (raw?.emailLoginToken) {
          const { hashLinkToken } = await import("@/lib/crypto/token-hash");
          const { isEmailLoginTokenExpired } = await import("@/lib/auth/email-login");
          const tokenHash = hashLinkToken(String(raw.emailLoginToken));
          if (!(await checkRateLimitPersistent(`email-login-redeem:${tokenHash.slice(0, 16)}`, 10, 60_000))) {
            return null;
          }
          const db = getDb();
          const [row] = await db
            .select()
            .from(users)
            .where(eq(users.emailLoginToken, tokenHash))
            .limit(1);
          if (!row || row.status !== "active" || row.role === "passive") {
            return null;
          }
          if (isEmailLoginTokenExpired(row.emailLoginTokenExpiresAt)) {
            return null;
          }
          const now = new Date().toISOString();
          await db
            .update(users)
            .set({
              emailLoginToken: null,
              emailLoginTokenExpiresAt: null,
              updatedAt: now,
            })
            .where(eq(users.id, row.id));
          await recordSuccessfulLogin(row.id);
          await logUserActivity(row.id, "auth.email_login_completed");
          const claims = await networkClaimsForUser(row.id);
          return {
            id: row.id,
            name: row.displayName,
            email: row.username,
            role: row.role,
            accountStatus: row.status,
            mustChangePassword: false,
            onboardingComplete: row.onboardingComplete,
            sessionVersion: row.sessionVersion,
            displayName: row.displayName,
            avatarKey: row.avatarKey ?? undefined,
            theme: row.theme,
            isImpersonating: false,
            emailLoginSession: true,
            ...claims,
          };
        }

        if (raw?.impersonateUserId) {
          // Constant-time compare, and denied outright on production unless
          // ALLOW_PROD_IMPERSONATION=1 is set explicitly (PC-353).
          if (!isValidImpersonationSecret(raw.impersonateSecret)) {
            return null;
          }

          // Secret alone is insufficient — require an existing admin JWT (e2e/admin
          // flows sign in as admin first, then call signIn with impersonate fields).
          if (!(await hasAdminSessionJwt())) {
            return null;
          }

          const db = getDb();
          const [row] = await db
            .select()
            .from(users)
            .where(eq(users.id, String(raw.impersonateUserId)))
            .limit(1);
          if (!row || row.status !== "active" || row.role === "passive") {
            return null;
          }
          const claims = await networkClaimsForUser(row.id);
          return {
            id: row.id,
            name: row.displayName,
            email: row.username,
            role: row.role as UserRole,
            accountStatus: row.status,
            mustChangePassword: row.mustChangePassword,
            onboardingComplete: row.onboardingComplete,
            sessionVersion: row.sessionVersion,
            displayName: row.displayName,
            avatarKey: row.avatarKey ?? undefined,
            theme: row.theme,
            // Marks JWT so Google Calendar API calls stay disabled (PC-344).
            isImpersonating: true,
            ...claims,
          };
        }

        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const loginKey = `login:${parsed.data.username.toLowerCase()}`;
        if (!(await checkRateLimitPersistent(loginKey, 10, 60_000))) {
          return null;
        }

        const db = getDb();
        const [row] = await db
          .select()
          .from(users)
          .where(eq(users.username, parsed.data.username.toLowerCase()))
          .limit(1);

        if (!row || row.status === "deleted" || row.role === "passive") {
          return null;
        }

        if (row.status === "banned") {
          const valid = await compare(parsed.data.password, row.passwordHash);
          if (!valid) return null;
          const claims = await networkClaimsForUser(row.id);
          return {
            id: row.id,
            name: row.displayName,
            email: row.username,
            role: row.role,
            accountStatus: "banned",
            mustChangePassword: row.mustChangePassword,
            onboardingComplete: row.onboardingComplete,
            sessionVersion: row.sessionVersion,
            displayName: row.displayName,
            avatarKey: row.avatarKey ?? undefined,
            theme: row.theme,
            isImpersonating: false,
            ...claims,
          };
        }

        const valid = await compare(parsed.data.password, row.passwordHash);
        if (!valid) return null;

        await recordSuccessfulLogin(row.id);
        const claims = await networkClaimsForUser(row.id);

        return {
          id: row.id,
          name: row.displayName,
          email: row.username,
          role: row.role,
          accountStatus: row.status,
          mustChangePassword: row.mustChangePassword,
          onboardingComplete: row.onboardingComplete,
          sessionVersion: row.sessionVersion,
          displayName: row.displayName,
          avatarKey: row.avatarKey ?? undefined,
          theme: row.theme,
          isImpersonating: false,
          ...claims,
        };
      },
    }),
  ],
});
