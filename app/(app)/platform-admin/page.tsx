import {
  getPlatformSettingsAction,
  listAllNetworksAction,
  setNetworkStatusAction,
  updatePlatformSettingsAction,
} from "@/actions/networks";
import {
  banUserPlatformAction,
  deleteUserPlatformAction,
  inhabitNetworkAdminAction,
  listPlatformUsersAction,
  pauseUserPlatformAction,
  resumeUserPlatformAction,
} from "@/actions/platform-admin";
import { auth } from "@/lib/auth";
import { PlatformAdminClient } from "@/components/platform/PlatformAdminClient";
import { redirect } from "next/navigation";

/**
 * Platform operator console — caps, network pause, telemetry, user moderation (PC-362).
 */
export default async function PlatformAdminPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.isPlatformAdmin !== true) {
    redirect("/feed");
  }

  const [networks, settings, users] = await Promise.all([
    listAllNetworksAction(),
    getPlatformSettingsAction(),
    listPlatformUsersAction(),
  ]);

  return (
    <PlatformAdminClient
      initialNetworks={networks}
      initialSettings={settings}
      initialUsers={users}
      setNetworkStatusAction={setNetworkStatusAction}
      updatePlatformSettingsAction={updatePlatformSettingsAction}
      pauseUserPlatformAction={pauseUserPlatformAction}
      banUserPlatformAction={banUserPlatformAction}
      resumeUserPlatformAction={resumeUserPlatformAction}
      deleteUserPlatformAction={deleteUserPlatformAction}
      inhabitNetworkAdminAction={inhabitNetworkAdminAction}
    />
  );
}
