import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";

import { z } from "zod";

import { recordSuccessfulLogin } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { users, type UserRole } from "@/lib/db/schema";
import { isNonProductionEnvironment } from "@/lib/env";

const credentialsSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

/**
 * Edge-safe Auth.js config — database lookups happen in authorize() on the Node runtime.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        impersonateUserId: { label: "Impersonate", type: "text" },
      },
      async authorize(raw) {
        if (
          raw?.impersonateUserId &&
          isNonProductionEnvironment()
        ) {
          const db = getDb();
          const [row] = await db
            .select()
            .from(users)
            .where(eq(users.id, String(raw.impersonateUserId)))
            .limit(1);
          if (!row || row.status !== "active" || row.role === "passive") {
            return null;
          }
          await recordSuccessfulLogin(row.id);
          return {
            id: row.id,
            name: row.displayName,
            email: row.username,
            role: row.role as UserRole,
            mustChangePassword: row.mustChangePassword,
            displayName: row.displayName,
          };
        }

        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const db = getDb();
        const [row] = await db
          .select()
          .from(users)
          .where(eq(users.username, parsed.data.username.toLowerCase()))
          .limit(1);

        if (!row || row.status !== "active" || row.role === "passive") {
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
          mustChangePassword: row.mustChangePassword,
          displayName: row.displayName,
        };
      },
    }),
  ],
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
        token.mustChangePassword = user.mustChangePassword;
        token.displayName = user.displayName;
      }
      if (trigger === "update" && session?.user) {
        token.mustChangePassword = session.user.mustChangePassword;
        token.displayName = session.user.displayName ?? token.displayName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.displayName = token.displayName as string;
        session.user.name = token.displayName as string;
      }
      return session;
    },
  },
  trustHost: true,
};
