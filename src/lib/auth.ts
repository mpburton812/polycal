import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

/**
 * Auth.js entry — JWT sessions in HttpOnly cookies (no localStorage tokens).
 */
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
