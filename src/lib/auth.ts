import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { recordSuccessfulLogin } from "@/lib/audit";
import { authConfig } from "../../auth.config";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users, type UserRole } from "@/lib/db/schema";
import { isNonProductionEnvironment } from "@/lib/env";

const credentialsSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

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
      },
      async authorize(raw) {
        await ensureDbReady();

        if (raw?.impersonateUserId && isNonProductionEnvironment()) {
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
            avatarKey: row.avatarKey ?? undefined,
            theme: row.theme,
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
          avatarKey: row.avatarKey ?? undefined,
          theme: row.theme,
        };
      },
    }),
  ],
});
