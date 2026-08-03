import { redirect } from "next/navigation";

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
  setUserAccessLevelAction,
} from "@/actions/platform-admin";
import { auth } from "@/lib/auth";
import { PlatformAdminClient } from "@/components/platform/PlatformAdminClient";

/**
 * Platform operator console — caps, network pause, telemetry, user moderation (PC-362).
 * MOTD publishing lives on Admin → Network with All Platform toggle (PC-406).
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
      currentUserId={session.user.id}
      setNetworkStatusAction={setNetworkStatusAction}
      updatePlatformSettingsAction={updatePlatformSettingsAction}
      pauseUserPlatformAction={pauseUserPlatformAction}
      banUserPlatformAction={banUserPlatformAction}
      resumeUserPlatformAction={resumeUserPlatformAction}
      deleteUserPlatformAction={deleteUserPlatformAction}
      inhabitNetworkAdminAction={inhabitNetworkAdminAction}
      setUserAccessLevelAction={setUserAccessLevelAction}
    />
  );
}
