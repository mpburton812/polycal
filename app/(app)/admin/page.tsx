import { Stack, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { listActivityLogAction } from "@/actions/admin";
import { getPolyGroupSettingsAction } from "@/actions/poly-group";
import { listAdminUsersAction } from "@/actions/users";
import { AdminCodeStatusPanel } from "@/components/admin/AdminCodeStatusPanel";
import { auth } from "@/lib/auth";
import { userCanAccessAdminPanel } from "@/lib/admin-access";
import { CHANGELOG, getLatestChangelogEntry } from "@/lib/changelog/entries";
import { isImpersonationConfigured } from "@/lib/auth/impersonation";
import { getBuildInfo, isNonProductionEnvironment } from "@/lib/env";
import { brutalPageTitleSx } from "@/theme/brutalUi";

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
  if (
    !session?.user ||
    !(await userCanAccessAdminPanel({
      role: session.user.role,
      activeNetworkRole: session.user.activeNetworkRole,
      isPlatformAdmin: session.user.isPlatformAdmin === true,
    }))
  ) {
    redirect("/feed");
  }

  const [settings, adminUsers, logEntries] = await Promise.all([
    getPolyGroupSettingsAction(),
    listAdminUsersAction(),
    listActivityLogAction(),
  ]);

  if (!settings) {
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
        <AdminPolyGroupSettingsPanel initialSettings={settings} />
        <AdminFastSleepingPlanPanel users={adminUsers} />
        <AdminUserManagementPanel
          users={adminUsers}
          currentUserId={session.user.id}
          impersonationEnabled={isImpersonationConfigured()}
        />
        <AdminActivityLogPanel entries={logEntries} />
        {isNonProductionEnvironment() && <AdminTestDataPanel />}
      </Stack>
    </>
  );
}
