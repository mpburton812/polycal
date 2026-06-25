import { getAppEnvironment } from "@/lib/env";

export type SeedProfile = "star-wars" | "test-family";

/**
 * Chooses which non-production seed dataset to apply.
 * E2E always uses Star Wars; deployed test uses the family fixture set.
 */
export function resolveSeedProfile(): SeedProfile {
  if (getAppEnvironment() === "test") {
    return "test-family";
  }
  if (process.env.E2E_TEST_MODE === "1") {
    return "star-wars";
  }
  return "star-wars";
}

export function usesTestFamilySeed(): boolean {
  return resolveSeedProfile() === "test-family";
}
