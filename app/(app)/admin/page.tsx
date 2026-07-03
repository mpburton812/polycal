import { Stack, Typography } from "@mui/material";
import { redirect } from "next/navigation";
import { join } from "node:path";

import { listActivityLogAction } from "@/actions/admin";
import { getPolyGroupSettingsAction } from "@/actions/poly-group";
import { listAdminUsersAction } from "@/actions/users";
import { AdminActivityLogPanel } from "@/components/admin/AdminActivityLogPanel";
import { AdminPolyGroupSettingsPanel } from "@/components/admin/AdminPolyGroupSettingsPanel";
import { AdminTestDataPanel } from "@/components/admin/AdminTestDataPanel";
import { AdminUserManagementPanel } from "@/components/admin/AdminUserManagementPanel";
import { AdminVersionPanel } from "@/components/admin/AdminVersionPanel";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getServerBuildInfo } from "@/lib/build-info";
import { isNonProductionEnvironment } from "@/lib/env";
import { brutalPageTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

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

  const buildInfo = getServerBuildInfo(join(process.cwd()));

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom sx={brutalPageTitleSx}>
        Admin
      </Typography>
      <Typography sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
        Group settings, members, and environment controls.
      </Typography>
      <Stack spacing={3}>
        <AdminVersionPanel buildInfo={buildInfo} />
        <AdminPolyGroupSettingsPanel initialSettings={settings} />
        <AdminUserManagementPanel users={adminUsers} currentUserId={session.user.id} />
        <AdminActivityLogPanel entries={logEntries} />
        {isNonProductionEnvironment() && <AdminTestDataPanel />}
      </Stack>
    </>
  );
}
