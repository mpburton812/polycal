/** Environment variables for isolated Playwright runs (no app imports). */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3099);

export const E2E_ENV = {
  TURSO_DATABASE_URL: "file:e2e.db",
  NEXT_PUBLIC_APP_ENV: "feature",
  AUTH_SECRET: "e2e-test-auth-secret-min-32-characters",
  AUTH_URL: `http://localhost:${E2E_PORT}`,
  E2E_TEST_MODE: "1",
} as const;
