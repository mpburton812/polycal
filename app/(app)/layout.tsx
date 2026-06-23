import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { auth } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "admin";

  return (
    <AppShell displayName={session.user.displayName} isAdmin={isAdmin}>
      {children}
    </AppShell>
  );
}
