import { requireNetworkSession } from "@/lib/networks/context";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { schedulingProposalsEnabled } from "@/types/network-settings";

/**
 * Bottom Proposals tab is hidden when Event Types is Just Bookings (PC-528).
 * Default true when the session or settings cannot be loaded so the shell still navigates.
 */
export async function isProposalsTabVisible(): Promise<boolean> {
  const session = await requireNetworkSession();
  if (!session.ok) return true;
  const settings = await loadNetworkSettings(session.user.activeNetworkId);
  return schedulingProposalsEnabled(settings?.schedulingPosting ?? "proposals_only");
}
