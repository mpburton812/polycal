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

/** Short git SHA surfaced in the dev bar (injected at build time on Vercel). */
export function getBuildSha(): string {
  return process.env.NEXT_PUBLIC_BUILD_SHA ?? "local";
}

/** Active git branch name for the dev bar. */
export function getBuildBranch(): string {
  return process.env.NEXT_PUBLIC_BUILD_BRANCH ?? "local";
}
