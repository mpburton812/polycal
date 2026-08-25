import { loginCallbackUrlFromRequest } from "@/lib/auth/callback-url";
import { edgeAuth } from "@/lib/auth-edge";
import { isE2eApiAuthorized } from "@/lib/e2e-api";

/**
 * Edge middleware — redirects unauthenticated users and paused accounts (PC-59 security).
 */
export default edgeAuth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

  if (pathname === "/api/e2e" || pathname.startsWith("/api/e2e/")) {
    if (!isE2eApiAuthorized(request)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return undefined;
  }

  // Alpha-feedback admin APIs authenticate via Bearer token (Tauri tracker) or session.
  const publicPaths = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/create-network",
    "/setup-network",
    "/privacy",
    "/terms",
    "/paused",
    "/banned",
    "/network-closed",
    "/feedback",
    "/offline",
    "/.well-known",
    "/manifest.webmanifest",
    "/manifest",
    "/api/auth",
    "/api/cron",
    "/api/admin/alpha-feedback",
  ];
  const isPublic =
    pathname === "/" ||
    publicPaths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname.startsWith("/api/verify-email");

  if (isPublic) {
    return undefined;
  }

  if (!session?.user?.id) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set(
      "callbackUrl",
      loginCallbackUrlFromRequest(request.nextUrl),
    );
    return Response.redirect(loginUrl);
  }

  if (session.user.accountStatus === "paused" && pathname !== "/paused") {
    return Response.redirect(new URL("/paused", request.nextUrl.origin));
  }

  if (session.user.accountStatus === "banned" && pathname !== "/banned") {
    return Response.redirect(new URL("/banned", request.nextUrl.origin));
  }

  return undefined;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
