import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HomeMarketing } from "@/components/brand/HomeMarketing";
import { auth } from "@/lib/auth";
import { BRAND_CORE_DESCRIPTION, BRAND_DISPLAY_NAME } from "@/lib/brand/public-identity";

export const metadata: Metadata = {
  title: BRAND_DISPLAY_NAME,
  description: BRAND_CORE_DESCRIPTION,
};

/**
 * Public homepage for brand verification and first-time visitors (PC-344 / PC-494).
 * Signed-in users continue into the app.
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    const { isFeedEnabledForActiveNetwork } = await import("@/lib/feed/feed-enabled");
    redirect((await isFeedEnabledForActiveNetwork()) ? "/feed" : "/schedule");
  }

  return <HomeMarketing />;
}
