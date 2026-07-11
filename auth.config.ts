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
        // Force a DB re-check after client session.update (password / onboarding).
        token.dbRefreshedAt = 0;
      }

      if (token.id) {
        const refreshedAt = typeof token.dbRefreshedAt === "number" ? token.dbRefreshedAt : 0;
        // Never TTL-skip while the user still owes password change or onboarding —
        // those flags must stay in sync with Turso or the wizard never exits.
        const onboardedAndSettled =
          token.onboardingComplete === true && token.mustChangePassword === false;
        const withinTtl =
          trigger !== "update" &&
          !user &&
          onboardedAndSettled &&
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
          })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);

        if (!row || row.status === "deleted") {
          token.error = "SessionInvalid";
          return token;
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
        session.user.accountStatus = (token.accountStatus as "active" | "paused") ?? "active";
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.onboardingComplete = token.onboardingComplete as boolean;
        session.user.displayName = token.displayName as string;
        session.user.name = token.displayName as string;
        session.user.avatarKey = token.avatarKey as string | undefined;
        session.user.theme = token.theme as string | undefined;
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
