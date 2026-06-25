import { isNonProductionEnvironment, getAppEnvironment } from "@/lib/env";
import { getSeedDefaultPasswordHint } from "@/lib/seed/star-wars";
import { TEST_FAMILY_DEFAULT_PASSWORD } from "@/lib/seed/test-family";

/**
 * Login hint shown on the credentials page in non-production tiers.
 */
export function getNonProductionLoginHint(): string | null {
  if (!isNonProductionEnvironment()) {
    return null;
  }

  if (getAppEnvironment() === "test") {
    return `Test seed: mpburton / ${TEST_FAMILY_DEFAULT_PASSWORD}`;
  }

  return `Dev seed: luke / ${getSeedDefaultPasswordHint()}`;
}
