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
import {
  clearPlatformMotdAction,
  getPlatformMotdAdminStateAction,
  publishPlatformMotdAction,
} from "@/actions/motd";
import { auth } from "@/lib/auth";
import { PlatformAdminClient } from "@/components/platform/PlatformAdminClient";

/**
 * Platform operator console — caps, network pause, telemetry, user moderation (PC-362).
 */
export default async function PlatformAdminPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.isPlatformAdmin !== true) {
    redirect("/feed");
  }

  const [networks, settings, users, platformMotd] = await Promise.all([
    listAllNetworksAction(),
    getPlatformSettingsAction(),
    listPlatformUsersAction(),
    getPlatformMotdAdminStateAction().then((r) => (r.ok ? r.data : null)),
  ]);

  return (
    <PlatformAdminClient
      initialNetworks={networks}
      initialSettings={settings}
      initialUsers={users}
      currentUserId={session.user.id}
      initialMotd={platformMotd}
      setNetworkStatusAction={setNetworkStatusAction}
      updatePlatformSettingsAction={updatePlatformSettingsAction}
      pauseUserPlatformAction={pauseUserPlatformAction}
      banUserPlatformAction={banUserPlatformAction}
      resumeUserPlatformAction={resumeUserPlatformAction}
      deleteUserPlatformAction={deleteUserPlatformAction}
      inhabitNetworkAdminAction={inhabitNetworkAdminAction}
      setUserAccessLevelAction={setUserAccessLevelAction}
      publishPlatformMotdAction={publishPlatformMotdAction}
      clearPlatformMotdAction={clearPlatformMotdAction}
    />
  );
}
