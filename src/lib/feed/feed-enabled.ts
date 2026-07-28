import type { getDb } from "@/lib/db/client";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { requireNetworkSession } from "@/lib/networks/context";

type Db = ReturnType<typeof getDb>;

/**
 * Whether Feed is enabled for a network (default ON when unset).
 * Prefer passing the same `db` handle as the caller to avoid SQLite stalls (PC-232).
 */
export async function isFeedEnabledForNetwork(
  networkId: string,
  db?: Db,
): Promise<boolean> {
  const settings = await loadNetworkSettings(networkId, db);
  return settings?.feedEnabled !== false;
}

/**
 * Session-scoped Feed enabled check for UI/route gates outside an existing withDb.
 */
export async function isFeedEnabledForActiveNetwork(): Promise<boolean> {
  const session = await requireNetworkSession();
  if (!session.ok) return true;
  return isFeedEnabledForNetwork(session.user.activeNetworkId);
}
