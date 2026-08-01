import { z } from "zod";

import { SHORT_TEXT_MAX, maxCharsMessage } from "@/lib/validation/string-limits";

/** Optional People & Places blurb (PC-117 / PC-244). */
export const PROFILE_BIO_MAX_LENGTH = SHORT_TEXT_MAX;

export const profileBioSchema = z
  .string()
  .trim()
  .max(PROFILE_BIO_MAX_LENGTH, maxCharsMessage("About Me", PROFILE_BIO_MAX_LENGTH))
  .optional()
  .transform((value) => value || null);
