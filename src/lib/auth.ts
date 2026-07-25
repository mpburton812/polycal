import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getToken } from "next-auth/jwt";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { recordSuccessfulLogin } from "@/lib/audit";
import { isValidImpersonationSecret } from "@/lib/auth/impersonation";
import { authConfig } from "../../auth.config";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users, type UserRole } from "@/lib/db/schema";
import { checkRateLimitPersistent } from "@/lib/rate-limit";

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
    if (token?.role === "admin") {
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
      },
      async authorize(raw) {
        await ensureDbReady();

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

        const valid = await compare(parsed.data.password, row.passwordHash);
        if (!valid) return null;

        await recordSuccessfulLogin(row.id);

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
        };
      },
    }),
  ],
});
