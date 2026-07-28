import { Suspense } from "react";
import { redirect } from "next/navigation";

import { listPeopleAction } from "@/actions/users";
import { getPolyGroupDisplayNameAction } from "@/actions/poly-group";
import { getNotificationInboxAction } from "@/actions/notifications";
import { getNotificationPrefsAction } from "@/actions/profile";
import { AppShell } from "@/components/layout/AppShell";
import { FirstLoginWizard } from "@/components/onboarding/FirstLoginWizard";
import { UserThemeProvider } from "@/components/providers/UserThemeProvider";
import { BrandedLoading } from "@/components/ui/BrandedLoading";
import { auth } from "@/lib/auth";
import { getLiveUserStatus } from "@/lib/auth-session";
import { userCanSeeAdminTab } from "@/lib/admin-access";
import { normalizeUserThemeId } from "@/lib/constants/themes";
import { isFeedEnabledForActiveNetwork } from "@/lib/feed/feed-enabled";
import { DEFAULT_NOTIFICATION_PREFS } from "@/types/notification-prefs";

/**
 * Authenticated app chrome. Outer Suspense shows a branded splash while this
 * layout’s auth + shell data resolve (PC-202).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<BrandedLoading fullPage label="Loading PolyCal…" />}>
      <AppLayoutReady>{children}</AppLayoutReady>
    </Suspense>
  );
}

async function AppLayoutReady({ children }: { children: React.ReactNode }) {
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
  if (liveStatus === "banned") {
    redirect("/banned");
  }

  const themeId = normalizeUserThemeId(session.user.theme ?? "sage");
  const showOnboarding = !session.user.onboardingComplete;

  // Shell chrome can paint as soon as admin flag resolves; inbox/prefs stream in parallel.
  const showAdminTab = userCanSeeAdminTab({
    role: session.user.role,
    activeNetworkRole: session.user.activeNetworkRole,
    isPlatformAdmin: session.user.isPlatformAdmin === true,
  });
  const notificationInboxPromise = getNotificationInboxAction();
  const notificationPrefsPromise = getNotificationPrefsAction();
  const groupNamePromise = getPolyGroupDisplayNameAction();
  const feedEnabledPromise = isFeedEnabledForActiveNetwork();
  const isPlatformAdmin = session.user.isPlatformAdmin === true;

  return (
    <UserThemeProvider themeId={themeId}>
      <Suspense
        fallback={
          <AppShell
            displayName={session.user.displayName}
            groupName="…"
            isAdmin={showAdminTab}
            avatarKey={session.user.avatarKey}
            notificationCount={0}
            notificationItems={[]}
            notificationPrefs={DEFAULT_NOTIFICATION_PREFS}
            isPlatformAdmin={isPlatformAdmin}
            feedEnabled
          >
            <BrandedLoading label="Loading…" />
          </AppShell>
        }
      >
        <AppShellWithData
          displayName={session.user.displayName}
          avatarKey={session.user.avatarKey}
          isAdmin={showAdminTab}
          isPlatformAdmin={isPlatformAdmin}
          showOnboarding={showOnboarding}
          mustChangePassword={session.user.mustChangePassword}
          themeId={themeId}
          userId={session.user.id}
          notificationInboxPromise={notificationInboxPromise}
          notificationPrefsPromise={notificationPrefsPromise}
          groupNamePromise={groupNamePromise}
          feedEnabledPromise={feedEnabledPromise}
        >
          {children}
        </AppShellWithData>
      </Suspense>
    </UserThemeProvider>
  );
}

async function AppShellWithData({
  children,
  displayName,
  avatarKey,
  isAdmin,
  isPlatformAdmin,
  showOnboarding,
  mustChangePassword,
  themeId,
  userId,
  notificationInboxPromise,
  notificationPrefsPromise,
  groupNamePromise,
  feedEnabledPromise,
}: {
  children: React.ReactNode;
  displayName: string;
  avatarKey?: string;
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  showOnboarding: boolean;
  mustChangePassword: boolean;
  themeId: string;
  userId: string;
  notificationInboxPromise: ReturnType<typeof getNotificationInboxAction>;
  notificationPrefsPromise: ReturnType<typeof getNotificationPrefsAction>;
  groupNamePromise: ReturnType<typeof getPolyGroupDisplayNameAction>;
  feedEnabledPromise: Promise<boolean>;
}) {
  const [notificationInbox, notificationPrefs, groupName, feedEnabled] = await Promise.all([
    notificationInboxPromise,
    notificationPrefsPromise,
    groupNamePromise,
    feedEnabledPromise,
  ]);

  let partnerOptions: { id: string; displayName: string }[] = [];
  if (showOnboarding) {
    const people = await listPeopleAction();
    partnerOptions = people
      .filter((p) => p.id !== userId)
      .map((p) => ({ id: p.id, displayName: p.displayName }));
  }

  return (
    <AppShell
      displayName={displayName}
      groupName={groupName}
      isAdmin={isAdmin}
      avatarKey={avatarKey}
      notificationCount={notificationInbox.count}
      notificationItems={notificationInbox.items}
      notificationPrefs={notificationPrefs}
      isPlatformAdmin={isPlatformAdmin}
      feedEnabled={feedEnabled}
    >
      {showOnboarding ? (
        <FirstLoginWizard
          mustChangePassword={mustChangePassword}
          initialAvatarKey={avatarKey ?? null}
          initialTheme={themeId}
          partnerOptions={partnerOptions}
        />
      ) : (
        children
      )}
    </AppShell>
  );
}
