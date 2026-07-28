import { loadNetworkSettings } from "@/lib/networks/settings";
import { requireNetworkSession } from "@/lib/networks/context";

/**
 * Returns whether Feed is enabled for the active network (default ON).
 */
export async function isFeedEnabledForActiveNetwork(): Promise<boolean> {
  const session = await requireNetworkSession();
  if (!session.ok) return true;
  const settings = await loadNetworkSettings(session.user.activeNetworkId);
  return settings?.feedEnabled !== false;
}
