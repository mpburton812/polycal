import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config for middleware — no database imports (PC-59).
 */
const edgeAuthConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token }) {
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user" | "passive";
        session.user.accountStatus = (token.accountStatus as "active" | "paused") ?? "active";
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;

export const { auth: edgeAuth } = NextAuth(edgeAuthConfig);
