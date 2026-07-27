/** Canonical platform operator identities (PC-362). */
export const PLATFORM_ADMIN_USERNAMES = new Set(["mpburton"]);
export const PLATFORM_ADMIN_EMAILS = new Set(["mpburton@gmail.com"]);

export function isPlatformAdminIdentity(input: {
  username?: string | null;
  notificationEmail?: string | null;
}): boolean {
  const username = input.username?.trim().toLowerCase();
  const email = input.notificationEmail?.trim().toLowerCase();
  return (
    (username != null && PLATFORM_ADMIN_USERNAMES.has(username)) ||
    (email != null && PLATFORM_ADMIN_EMAILS.has(email))
  );
}
