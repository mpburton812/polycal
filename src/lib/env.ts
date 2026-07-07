export type AppEnvironment = "feature" | "dev" | "test" | "production";

/** Fixed banner colors — never derived from the user accent theme. */
export const ENVIRONMENT_BANNER_COLORS: Record<
  AppEnvironment,
  { background: string; color: string; border: string }
> = {
  feature: { background: "#000000", color: "#ffffff", border: "#333333" },
  dev: { background: "#c62828", color: "#ffffff", border: "#8e0000" },
  test: { background: "#fdd835", color: "#1a1a1a", border: "#f9a825" },
  production: { background: "#2e7d32", color: "#ffffff", border: "#1b5e20" },
};

/**
 * Resolves the deployment tier from NEXT_PUBLIC_APP_ENV so client and server
 * share the same non-production gates (impersonation, seeding, dev bar).
 */
export function getAppEnvironment(): AppEnvironment {
  const raw = process.env.NEXT_PUBLIC_APP_ENV ?? "feature";
  if (
    raw === "feature" ||
    raw === "dev" ||
    raw === "test" ||
    raw === "production"
  ) {
    return raw;
  }
  return "feature";
}

/** True for feature, dev, and test — anything that may show test tooling. */
export function isNonProductionEnvironment(): boolean {
  return getAppEnvironment() !== "production";
}

/** Banner palette for the current deployment tier (theme-independent). */
export function getEnvironmentBannerColors(): (typeof ENVIRONMENT_BANNER_COLORS)[AppEnvironment] {
  return ENVIRONMENT_BANNER_COLORS[getAppEnvironment()];
}

/**
 * Canonical public base URL per deployment tier. Used as a fallback when
 * AUTH_URL / NEXTAUTH_URL are not present in the environment (e.g. local dev).
 * Mirrors scripts/validate-connectivity.mjs so onboarding links are correct.
 */
export const ENVIRONMENT_APP_URLS: Record<AppEnvironment, string> = {
  feature: "http://localhost:3000",
  dev: "https://polycal-git-dev-michael-burton-s-projects.vercel.app",
  test: "https://polycal-git-test-michael-burton-s-projects.vercel.app",
  production: "https://polycal-ebon.vercel.app",
};

/**
 * Resolves the public origin of the running deployment for links embedded in
 * emails / onboarding text. Prefers the auth base URL that Vercel sync scripts
 * set per environment (AUTH_URL), falling back to NEXTAUTH_URL and finally the
 * tier map so a test deployment never emits a production URL. Trailing slashes
 * are stripped so callers can safely append paths like "/login".
 */
export function getPublicAppUrl(): string {
  const explicit =
    process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  const base =
    explicit && explicit.length > 0
      ? explicit
      : ENVIRONMENT_APP_URLS[getAppEnvironment()];
  return base.replace(/\/+$/, "");
}

/** Short git SHA surfaced in the dev bar (injected at build time on Vercel). */
export function getBuildSha(): string {
  return process.env.NEXT_PUBLIC_BUILD_SHA ?? "local";
}

/** Active git branch name for the dev bar. */
export function getBuildBranch(): string {
  return process.env.NEXT_PUBLIC_BUILD_BRANCH ?? "local";
}

/**
 * ISO timestamp captured when this build was produced (deploy time on Vercel).
 * Surfaced in the admin Code Status panel as when the build went live.
 */
export function getBuildTime(): string | null {
  return process.env.NEXT_PUBLIC_BUILD_TIME ?? null;
}

/** Consolidated build/deploy descriptor for the Code Status panel + build-info API. */
export interface BuildInfo {
  sha: string;
  branch: string;
  time: string | null;
  environment: AppEnvironment;
}

/** Returns the current deployment's build descriptor. */
export function getBuildInfo(): BuildInfo {
  return {
    sha: getBuildSha(),
    branch: getBuildBranch(),
    time: getBuildTime(),
    environment: getAppEnvironment(),
  };
}

/**
 * Validates database URL against deployment tier at startup (PC-82).
 * Production must never use a local `file:` database.
 */
export function validateDeploymentDatabaseConfig(): void {
  const environment = getAppEnvironment();
  const databaseUrl = process.env.TURSO_DATABASE_URL?.trim() ?? "";

  if (environment === "production" && databaseUrl.startsWith("file:")) {
    throw new Error("Production deployments must not use a file: database URL.");
  }

  if (databaseUrl.includes("polycal-prod") || environment === "production") {
    console.info("[polycal] Database tier: production");
  } else if (databaseUrl.includes("polycal-test") || environment === "test") {
    console.info("[polycal] Database tier: test");
  } else if (databaseUrl.includes("polycal-dev") || environment === "dev") {
    console.info("[polycal] Database tier: dev");
  } else if (databaseUrl.startsWith("file:")) {
    console.info("[polycal] Database tier: local file");
  }
}
