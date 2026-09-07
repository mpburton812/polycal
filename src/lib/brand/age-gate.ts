/**
 * Birthdate age-gate helpers (18+) for public site and SMS opt-in (PC-494).
 */

export const AGE_GATE_COOKIE = "polycal_age_verified";
export const AGE_GATE_MIN_YEARS = 18;

/** Cookie max-age: 1 year. Stores only verification flag, never DOB. */
export const AGE_GATE_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;

/**
 * Returns age in whole years as of `asOf`, or null if the civil date is invalid.
 */
export function ageFromBirthdateParts(
  year: number,
  month: number,
  day: number,
  asOf: Date = new Date(),
): number | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return null;
  }
  const birth = new Date(year, month - 1, day);
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }
  if (birth.getTime() > asOf.getTime()) return null;

  let age = asOf.getFullYear() - year;
  const hadBirthday =
    asOf.getMonth() > month - 1 ||
    (asOf.getMonth() === month - 1 && asOf.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
}

/** True when the person is at least {@link AGE_GATE_MIN_YEARS}. */
export function isAdultBirthdate(
  year: number,
  month: number,
  day: number,
  asOf: Date = new Date(),
): boolean {
  const age = ageFromBirthdateParts(year, month, day, asOf);
  return age !== null && age >= AGE_GATE_MIN_YEARS;
}
