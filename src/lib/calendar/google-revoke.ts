/**
 * Revokes a Google OAuth access or refresh token (best-effort).
 * https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
 */
export async function revokeGoogleOAuthToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return false;
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: trimmed }),
    });
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}
