import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { MustChangePasswordForm } from "@/components/profile/MustChangePasswordForm";
import { UserThemeProvider } from "@/components/providers/UserThemeProvider";
import { auth } from "@/lib/auth";
import { isUserThemeId } from "@/lib/constants/themes";

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
  const themeId = isUserThemeId(session.user.theme ?? "")
    ? session.user.theme!
    : "mint";

  return (
    <UserThemeProvider themeId={themeId}>
      <AppShell
        displayName={session.user.displayName}
        isAdmin={isAdmin}
        avatarKey={session.user.avatarKey}
      >
        {session.user.mustChangePassword ? (
          <MustChangePasswordForm />
        ) : (
          children
        )}
      </AppShell>
    </UserThemeProvider>
  );
}
