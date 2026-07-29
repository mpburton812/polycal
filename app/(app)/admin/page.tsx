import { Stack, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { listActivityLogAction } from "@/actions/admin";
import {
  getActiveNetworkDashboardAction,
} from "@/actions/networks";
import {
  getNetworkMotdAdminStateAction,
} from "@/actions/motd";
import { getPolyGroupSettingsAction } from "@/actions/poly-group";
import { listAdminUsersAction } from "@/actions/users";
import { AdminCodeStatusPanel } from "@/components/admin/AdminCodeStatusPanel";
import { AdminNetworkDashboardPanel } from "@/components/admin/AdminNetworkDashboardPanel";
import { auth } from "@/lib/auth";
import { userCanSeeAdminTab, userHasAdminAccess } from "@/lib/admin-access";
import { CHANGELOG, getLatestChangelogEntry } from "@/lib/changelog/entries";
import { isImpersonationConfigured } from "@/lib/auth/impersonation";
import { getBuildInfo, isNonProductionEnvironment } from "@/lib/env";
import { brutalPageTitleSx } from "@/theme/brutalUi";
import type { NetworkMemberRole } from "@/types/network";

function AdminPanelFallback() {
  return (
    <p style={{ margin: 0, padding: "24px 0", textAlign: "center", color: "#666" }}>
      Loading admin panel…
    </p>
  );
}

/** Heavy admin panels code-split so the page shell paints first (PC-145). */
const AdminPolyGroupSettingsPanel = dynamic(
  () =>
    import("@/components/admin/AdminPolyGroupSettingsPanel").then((mod) => ({
      default: mod.AdminPolyGroupSettingsPanel,
    })),
  { loading: () => <AdminPanelFallback /> },
);
const AdminFastSleepingPlanPanel = dynamic(
  () =>
    import("@/components/admin/AdminFastSleepingPlanPanel").then((mod) => ({
      default: mod.AdminFastSleepingPlanPanel,
    })),
  { loading: () => <AdminPanelFallback /> },
);
const AdminUserManagementPanel = dynamic(
  () =>
    import("@/components/admin/AdminUserManagementPanel").then((mod) => ({
      default: mod.AdminUserManagementPanel,
    })),
  { loading: () => <AdminPanelFallback /> },
);
const AdminActivityLogPanel = dynamic(
  () =>
    import("@/components/admin/AdminActivityLogPanel").then((mod) => ({
      default: mod.AdminActivityLogPanel,
    })),
  { loading: () => <AdminPanelFallback /> },
);
const AdminTestDataPanel = dynamic(
  () =>
    import("@/components/admin/AdminTestDataPanel").then((mod) => ({
      default: mod.AdminTestDataPanel,
    })),
  { loading: () => <AdminPanelFallback /> },
);

export default async function AdminPage() {
  const session = await auth();
  const activeNetworkRole = session?.user?.activeNetworkRole as
    | NetworkMemberRole
    | undefined;
  const canSeeAdmin =
    session?.user &&
    userCanSeeAdminTab({
      role: session.user.role,
      activeNetworkRole,
      isPlatformAdmin: session.user.isPlatformAdmin === true,
    });

  if (!canSeeAdmin) {
    redirect("/feed");
  }

  const isLegacyAdmin = await userHasAdminAccess(session.user.role);
  const isPlatformAdmin = session.user.isPlatformAdmin === true;
  const isNetworkAdmin =
    activeNetworkRole === "network_admin" || isLegacyAdmin || isPlatformAdmin;

  const [
    settings,
    adminUsers,
    logEntries,
    networkDashboard,
    networkMotd,
  ] = await Promise.all([
    isLegacyAdmin ? getPolyGroupSettingsAction() : Promise.resolve(null),
    isLegacyAdmin ? listAdminUsersAction() : Promise.resolve([]),
    isLegacyAdmin ? listActivityLogAction() : Promise.resolve([]),
    isNetworkAdmin ? getActiveNetworkDashboardAction() : Promise.resolve(null),
    isNetworkAdmin
      ? getNetworkMotdAdminStateAction().then((r) => (r.ok ? r.data : null))
      : Promise.resolve(null),
  ]);

  if (isLegacyAdmin && !settings) {
    redirect("/feed");
  }

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom sx={brutalPageTitleSx}>
        Admin
      </Typography>
      <Stack spacing={3}>
        <AdminCodeStatusPanel
          buildInfo={getBuildInfo()}
          changelog={CHANGELOG}
          latestEntry={getLatestChangelogEntry()}
        />
        {networkDashboard && (
          <AdminNetworkDashboardPanel
            dashboard={networkDashboard}
            initialMotd={networkMotd}
          />
        )}
        {isLegacyAdmin && settings && (
          <>
            <AdminPolyGroupSettingsPanel initialSettings={settings} />
            <AdminFastSleepingPlanPanel users={adminUsers} />
            <AdminUserManagementPanel
              users={adminUsers}
              currentUserId={session.user.id}
              canManagePlatformAdmin={isPlatformAdmin}
              impersonationEnabled={isImpersonationConfigured()}
            />
            <AdminActivityLogPanel entries={logEntries} />
            {isNonProductionEnvironment() && <AdminTestDataPanel />}
          </>
        )}
      </Stack>
    </>
  );
}
