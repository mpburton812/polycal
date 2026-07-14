import { headers } from "next/headers";

import { VerifyEmailResult } from "@/components/auth/VerifyEmailResult";
import { verifyNotificationEmailToken } from "@/lib/email/verify-notification-email";

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Public notification-email verification landing — no JSON, continue into the app (PC-207).
 */
export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  if (!token) {
    return <VerifyEmailResult outcome="missing" />;
  }

  const headerList = await headers();
  const clientKey =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown";

  const outcome = await verifyNotificationEmailToken({ token, clientKey });
  return <VerifyEmailResult outcome={outcome} />;
}
