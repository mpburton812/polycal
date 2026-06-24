import { Stack, Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { listActivityLogAction } from "@/actions/admin";
import { getPolyGroupSettingsAction } from "@/actions/poly-group";
import { listAdminUsersAction } from "@/actions/users";
import { AdminActivityLogPanel } from "@/components/admin/AdminActivityLogPanel";
import { AdminForceReloadPanel } from "@/components/admin/AdminForceReloadPanel";
import { AdminPolyGroupSettingsPanel } from "@/components/admin/AdminPolyGroupSettingsPanel";
import { AdminTestDataPanel } from "@/components/admin/AdminTestDataPanel";
import { AdminUserManagementPanel } from "@/components/admin/AdminUserManagementPanel";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getAppEnvironment, getBuildBranch, getBuildSha, isNonProductionEnvironment } from "@/lib/env";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || !(await userHasAdminAccess(session.user.role))) {
    redirect("/schedule");
  }

  const [settings, adminUsers, logEntries] = await Promise.all([
    getPolyGroupSettingsAction(),
    listAdminUsersAction(),
    listActivityLogAction(),
  ]);

  if (!settings) {
    redirect("/schedule");
  }

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom>
        Admin
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Poly group settings, user management, and system log (PC-30–32).
      </Typography>
      <Stack spacing={3}>
        <AdminForceReloadPanel
          environment={getAppEnvironment()}
          buildSha={getBuildSha()}
          buildBranch={getBuildBranch()}
        />
        <AdminPolyGroupSettingsPanel initialSettings={settings} />
        <AdminUserManagementPanel users={adminUsers} currentUserId={session.user.id} />
        <AdminActivityLogPanel entries={logEntries} />
        {isNonProductionEnvironment() && <AdminTestDataPanel />}
      </Stack>
    </>
  );
}
