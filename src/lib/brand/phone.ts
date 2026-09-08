/**
 * Phone helpers for SMS opt-in (PC-494). Stores digits with optional leading +.
 */

/** Normalize user input to a comparable phone key (E.164-ish digits). */
export function normalizePhoneDigits(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  // US 10-digit → assume +1
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

/** Display form with leading +. */
export function formatPhoneForStorage(raw: string): string | null {
  const digits = normalizePhoneDigits(raw);
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Loose equality for matching public opt-in to profile phones. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizePhoneDigits(a) === normalizePhoneDigits(b);
}
