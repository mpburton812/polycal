/**
 * Formats a remaining duration until an ISO deadline for card countdowns (PC-294).
 */
export function formatCountdownRemaining(expiresAt: string, nowMs = Date.now()): string {
  const targetMs = Date.parse(expiresAt);
  if (Number.isNaN(targetMs)) return "—";
  const delta = targetMs - nowMs;
  if (delta <= 0) return "Expired";

  const totalSeconds = Math.floor(delta / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
