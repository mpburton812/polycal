/** Environment variables for isolated Playwright runs (no app imports). */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3099);

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

export const E2E_ENV = {
  TURSO_DATABASE_URL: "file:e2e.db",
  NEXT_PUBLIC_APP_ENV: "feature",
  AUTH_SECRET: "e2e-test-auth-secret-min-32-characters",
  AUTH_URL: `http://localhost:${E2E_PORT}`,
  E2E_TEST_MODE: "1",
  E2E_ANCHOR_DATE,
  CRON_SECRET: E2E_CRON_SECRET,
} as const;
