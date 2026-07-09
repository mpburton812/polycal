import { z } from "zod";

/** Optional People & Places blurb (PC-117). */
export const PROFILE_BIO_MAX_LENGTH = 500;

export const profileBioSchema = z
  .string()
  .trim()
  .max(PROFILE_BIO_MAX_LENGTH, `Bio must be ${PROFILE_BIO_MAX_LENGTH} characters or fewer.`)
  .optional()
  .transform((value) => value || null);
