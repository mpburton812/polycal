import { redirect } from "next/navigation";

import { EmailLoginRedeemForm } from "@/components/auth/EmailLoginRedeemForm";

interface EmailLoginPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Redeems a one-time email login token via a server action (PC-465).
 * Calling `signIn` during RSC render cannot set the session cookie.
 */
export default async function EmailLoginPage({ searchParams }: EmailLoginPageProps) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  if (!token) {
    redirect("/login?error=CredentialsSignin");
  }

  return <EmailLoginRedeemForm token={token} />;
}
