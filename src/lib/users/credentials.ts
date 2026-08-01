import { randomBytes } from "node:crypto";

import { getPublicAppUrl } from "@/lib/env";

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * Generates a readable temporary password for admin-provisioned accounts.
 */
export function generateTemporaryPassword(length = 12): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join(
    "",
  );
}

/**
 * Clipboard-ready onboarding text for externally emailed credentials (spec §4).
 */
export function buildLoginInstructions(options: {
  username: string;
  password: string;
  appUrl?: string;
}): string {
  // Derive the sign-in URL from the running deployment (AUTH_URL per Vercel
  // environment) instead of hardcoding production, so credentials provisioned
  // on dev/test point at the matching environment. Callers may still override.
  const baseUrl = (options.appUrl ?? getPublicAppUrl()).replace(/\/+$/, "");
  return [
    "Welcome to PolyCal!",
    "",
    `Sign in: ${baseUrl}/login`,
    `Username: ${options.username}`,
    `Temporary password: ${options.password}`,
    "",
    "On first login you will be asked to change your password.",
  ].join("\n");
}
