/** Environment variables for isolated Playwright runs (no app imports). */

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3099);

export const E2E_API_SECRET = "e2e-api-secret-for-playwright-tests";
export const E2E_IMPERSONATION_SECRET = "e2e-impersonation-secret-for-tests";

/** ISO date (YYYY-MM-DD) for the Monday of the current local week — pins demo proposal seeds (PC-64). */
export function resolveE2eAnchorDate(): string {
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

export const E2E_ANCHOR_DATE = resolveE2eAnchorDate();

export const E2E_CRON_SECRET = "e2e-cron-secret-for-playwright-tests";

/** File URL for worker-isolated SQLite DB (PC-176). */
export function e2eDbUrl(workerIndex = 0): string {
  return `file:e2e-w${workerIndex}.db`;
}

/** Base env shared by all e2e Next servers (AUTH_URL / DB set per worker). */
export function e2eEnvForWorker(workerIndex: number): Record<string, string> {
  const port = E2E_PORT + workerIndex;
  return {
    TURSO_DATABASE_URL: e2eDbUrl(workerIndex),
    NEXT_PUBLIC_APP_ENV: "feature",
    AUTH_SECRET: "e2e-test-auth-secret-min-32-characters",
    AUTH_IMPERSONATION_SECRET: E2E_IMPERSONATION_SECRET,
    AUTH_URL: `http://localhost:${port}`,
    E2E_TEST_MODE: "1",
    E2E_API_SECRET,
    E2E_ANCHOR_DATE,
    CRON_SECRET: E2E_CRON_SECRET,
    PORT: String(port),
  };
}

/** @deprecated Prefer e2eEnvForWorker(0) — kept for scripts that expect a flat map. */
export const E2E_ENV = e2eEnvForWorker(0);
