import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";

interface EmailLoginPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Redeems a one-time email login token via the Credentials provider (PC-465).
 * Does not set mustChangePassword — the JWT marks this as an emailLoginSession.
 */
export default async function EmailLoginPage({ searchParams }: EmailLoginPageProps) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  if (!token) {
    redirect("/login?error=CredentialsSignin");
  }

  // redirect:false so a successful redeem does not throw NEXT_REDIRECT that
  // this page would otherwise swallow as CredentialsSignin (PC-465).
  const result = await signIn("credentials", {
    emailLoginToken: token,
    redirect: false,
  });
  if (!result || result.error) {
    redirect("/login?error=CredentialsSignin");
  }
  redirect("/feed");
}
