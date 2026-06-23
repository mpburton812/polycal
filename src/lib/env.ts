export type AppEnvironment = "feature" | "dev" | "test" | "production";

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

/** Short git SHA surfaced in the dev bar (injected at build time on Vercel). */
export function getBuildSha(): string {
  return process.env.NEXT_PUBLIC_BUILD_SHA ?? "local";
}

/** Active git branch name for the dev bar. */
export function getBuildBranch(): string {
  return process.env.NEXT_PUBLIC_BUILD_BRANCH ?? "local";
}
