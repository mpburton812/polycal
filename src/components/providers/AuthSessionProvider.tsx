"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Auth.js session context — disable focus refetch to avoid extra Node auth()/JWT
 * DB hits when switching browser tabs (PC-144).
 */
export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
