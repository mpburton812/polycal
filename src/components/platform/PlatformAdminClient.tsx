"use client";

import {
  setNetworkStatusAction,
  updatePlatformSettingsAction,
} from "@/actions/networks";
import { AdminPlatformDashboardPanel } from "@/components/admin/AdminPlatformDashboardPanel";
import type { PlatformDashboardData } from "@/actions/networks";

/**
 * Client UI for /platform-admin — reuses the Admin platform dashboard (PC-365).
 */
export function PlatformAdminClient({
  initialDashboard,
}: {
  initialDashboard: PlatformDashboardData;
}) {
  return (
    <AdminPlatformDashboardPanel
      initialDashboard={initialDashboard}
      setNetworkStatusAction={setNetworkStatusAction}
      updatePlatformSettingsAction={updatePlatformSettingsAction}
      embedded={false}
    />
  );
}
