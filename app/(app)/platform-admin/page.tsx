import { redirect } from "next/navigation";

import {
  getPlatformSettingsAction,
  listAllNetworksAction,
  setNetworkStatusAction,
  updatePlatformSettingsAction,
} from "@/actions/networks";
import { auth } from "@/lib/auth";
import { PlatformAdminClient } from "@/components/platform/PlatformAdminClient";

/**
 * Platform operator console — caps, network pause, telemetry counts (PC-362).
 */
export default async function PlatformAdminPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.isPlatformAdmin !== true) {
    redirect("/feed");
  }

  const [networks, settings] = await Promise.all([
    listAllNetworksAction(),
    getPlatformSettingsAction(),
  ]);

  return (
    <PlatformAdminClient
      initialNetworks={networks}
      initialSettings={settings}
      setNetworkStatusAction={setNetworkStatusAction}
      updatePlatformSettingsAction={updatePlatformSettingsAction}
    />
  );
}
