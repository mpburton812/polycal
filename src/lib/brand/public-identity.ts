/**
 * Public brand identity for carrier verification and SMS disclosures (PC-494).
 * No legal entity name, street address, or support phone — email only.
 */
export const BRAND_DISPLAY_NAME = "PolyCal";

export const BRAND_SUPPORT_EMAIL = "support@polycal.net";

export const BRAND_SUPPORT_MAILTO = `mailto:${BRAND_SUPPORT_EMAIL}`;

/** Short product description for homepage / about. */
export const BRAND_CORE_DESCRIPTION =
  "PolyCal is a private-group scheduling service for polyamorous households and relationship networks. Members propose and book social events and sleeping arrangements, vote with partners, follow a shared feed, and optionally sync confirmed plans to Google Calendar or download iCal files.";

/** SMS campaign use-case language (account/schedule alerts — not marketing). */
export const BRAND_SMS_USE_CASES =
  "account alerts and calendar or schedule reminders";

/**
 * Full Telnyx/CTIA-style SMS consent disclaimer body (PC-494).
 */
export function brandSmsDisclaimerText(): string {
  return `By providing your phone number, you agree to receive SMS ${BRAND_SMS_USE_CASES} from ${BRAND_DISPLAY_NAME}. Message frequency may vary. Standard Message and Data Rates may apply. Reply STOP to opt out. Reply HELP for help. We will not share mobile information with third parties for promotional or marketing purposes.`;
}
