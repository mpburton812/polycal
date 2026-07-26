import { redirect } from "next/navigation";

import { getPlatformDashboardAction } from "@/actions/networks";
import { auth } from "@/lib/auth";
import { PlatformAdminClient } from "@/components/platform/PlatformAdminClient";

/**
 * Platform operator console — caps, network pause, node telemetry (PC-362 / PC-365).
 */
export default async function PlatformAdminPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.isPlatformAdmin !== true) {
    redirect("/feed");
  }

  const dashboard = await getPlatformDashboardAction();
  if (!dashboard) {
    redirect("/feed");
  }

  return <PlatformAdminClient initialDashboard={dashboard} />;
}
