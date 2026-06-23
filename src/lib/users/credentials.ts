import { randomBytes } from "node:crypto";

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
  const baseUrl = options.appUrl ?? "https://polycal-ebon.vercel.app";
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
