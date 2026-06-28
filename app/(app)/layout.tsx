import { redirect } from "next/navigation";

import { listPeopleAction } from "@/actions/users";
import { getPolyGroupDisplayNameAction } from "@/actions/poly-group";
import { getNotificationInboxAction } from "@/actions/notifications";
import { getNotificationPrefsAction } from "@/actions/profile";
import { AppShell } from "@/components/layout/AppShell";
import { FirstLoginWizard } from "@/components/onboarding/FirstLoginWizard";
import { UserThemeProvider } from "@/components/providers/UserThemeProvider";
import { auth } from "@/lib/auth";
import { getLiveUserStatus } from "@/lib/auth-session";
import { userHasAdminAccess } from "@/lib/admin-access";
import { isUserThemeId } from "@/lib/constants/themes";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const liveStatus = await getLiveUserStatus(session.user.id);
  if (liveStatus === "deleted") {
    redirect("/login");
  }
  if (liveStatus === "paused") {
    redirect("/paused");
  }

  const hasAdminAccess = await userHasAdminAccess(session.user.role);
  const themeId = isUserThemeId(session.user.theme ?? "")
    ? session.user.theme!
    : "mint";

  const notificationInbox = await getNotificationInboxAction();
  const notificationPrefs = await getNotificationPrefsAction();
  const groupName = await getPolyGroupDisplayNameAction();

  const showOnboarding = !session.user.onboardingComplete;

  let partnerOptions: { id: string; displayName: string }[] = [];
  if (showOnboarding) {
    const people = await listPeopleAction();
    partnerOptions = people
      .filter((p) => p.id !== session.user.id)
      .map((p) => ({ id: p.id, displayName: p.displayName }));
  }

  return (
    <UserThemeProvider themeId={themeId}>
      <AppShell
        displayName={session.user.displayName}
        groupName={groupName}
        isAdmin={hasAdminAccess}
        avatarKey={session.user.avatarKey}
        notificationCount={notificationInbox.count}
        notificationItems={notificationInbox.items}
        notificationPrefs={notificationPrefs}
      >
        {showOnboarding ? (
          <FirstLoginWizard
            mustChangePassword={session.user.mustChangePassword}
            initialAvatarKey={session.user.avatarKey ?? null}
            initialTheme={themeId}
            partnerOptions={partnerOptions}
          />
        ) : (
          children
        )}
      </AppShell>
    </UserThemeProvider>
  );
}
