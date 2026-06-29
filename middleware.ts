import { edgeAuth } from "@/lib/auth-edge";

/**
 * Edge middleware — redirects unauthenticated users and paused accounts (PC-59 security).
 */
export default edgeAuth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

  const publicPaths = ["/login", "/paused", "/offline", "/api/auth", "/api/e2e", "/api/cron"];
  const isPublic =
    publicPaths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname.startsWith("/api/verify-email");

  if (isPublic) {
    return undefined;
  }

  if (!session?.user?.id) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }

  if (session.user.accountStatus === "paused" && pathname !== "/paused") {
    return Response.redirect(new URL("/paused", request.nextUrl.origin));
  }

  return undefined;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
