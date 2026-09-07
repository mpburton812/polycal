import type { Metadata } from "next";

import { PublicSmsOptInForm } from "@/components/brand/PublicSmsOptInForm";
import { BRAND_DISPLAY_NAME } from "@/lib/brand/public-identity";

export const metadata: Metadata = {
  title: `SMS opt-in · ${BRAND_DISPLAY_NAME}`,
  description: `Optional SMS alerts opt-in for ${BRAND_DISPLAY_NAME} account and calendar reminders.`,
};

/** Public SMS opt-in URL for 10DLC / Telnyx brand verification (PC-494). */
export default function SmsOptInPage() {
  return <PublicSmsOptInForm />;
}
