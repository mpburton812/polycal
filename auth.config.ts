import type { NextAuthConfig } from "next-auth";

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
        token.mustChangePassword = user.mustChangePassword;
        token.displayName = user.displayName;
        token.avatarKey = user.avatarKey;
        token.theme = user.theme;
      }
      if (trigger === "update" && session?.user) {
        token.mustChangePassword = session.user.mustChangePassword;
        token.displayName = session.user.displayName ?? token.displayName;
        if (session.user.avatarKey) token.avatarKey = session.user.avatarKey;
        if (session.user.theme) token.theme = session.user.theme;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user" | "passive";
        session.user.mustChangePassword = token.mustChangePassword as boolean;
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
