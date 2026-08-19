export interface PersonRankStat {
  userId: string;
  inviteCount: number;
  lastAt: string | null;
}

/**
 * Sorts people by interaction frequency and recency, then name.
 * Sleeping partners get a modest boost when `partnerIds` is provided.
 */
export function rankPeople<T extends { id: string; displayName: string }>(
  people: T[],
  stats: PersonRankStat[],
  options?: { partnerIds?: readonly string[] },
): T[] {
  const byId = new Map(stats.map((row) => [row.userId, row]));
  const partnerSet = new Set(options?.partnerIds ?? []);

  return [...people].sort((a, b) => {
    const scoreA = scorePerson(a.id, byId.get(a.id), partnerSet);
    const scoreB = scorePerson(b.id, byId.get(b.id), partnerSet);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.displayName.localeCompare(b.displayName);
  });
}

function scorePerson(
  userId: string,
  stat: PersonRankStat | undefined,
  partnerIds: Set<string>,
): number {
  const count = stat?.inviteCount ?? 0;
  const recency = recencyScore(stat?.lastAt ?? null);
  const partnerBoost = partnerIds.has(userId) ? 50 : 0;
  return count * 1000 + recency + partnerBoost;
}

/**
 * Folds proposer-side and invitee-side invite rows into Who-chip rank stats (PC-449).
 * Viewer-scoped SQL feeds this instead of scanning every network invitee.
 */
export function mergeViewerInviteRankRows(
  asProposer: Array<{ userId: string; createdAt: string }>,
  asInvitee: Array<{ proposerId: string; createdAt: string }>,
): PersonRankStat[] {
  const stats = new Map<string, { inviteCount: number; lastAt: string | null }>();
  const bump = (otherId: string, createdAt: string) => {
    const current = stats.get(otherId) ?? { inviteCount: 0, lastAt: null };
    current.inviteCount += 1;
    if (!current.lastAt || createdAt > current.lastAt) current.lastAt = createdAt;
    stats.set(otherId, current);
  };
  for (const row of asProposer) bump(row.userId, row.createdAt);
  for (const row of asInvitee) bump(row.proposerId, row.createdAt);
  return [...stats.entries()].map(([userId, value]) => ({ userId, ...value }));
}
function recencyScore(lastAt: string | null): number {
  if (!lastAt) return 0;
  const then = Date.parse(lastAt);
  if (Number.isNaN(then)) return 0;
  const days = Math.max(0, (Date.now() - then) / 86_400_000);
  return Math.max(0, Math.round(365 - days));
}
