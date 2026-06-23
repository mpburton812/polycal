import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Auth.js v5 session cookie names (including chunked `.0`, `.1`, … suffixes). */
const SESSION_COOKIE_PREFIXES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
] as const;

/**
 * Lightweight Edge guard — checks for an Auth.js session cookie only.
 * JWT validation stays in src/lib/auth.ts on the Node runtime (pages/API).
 */
function hasAuthSessionCookie(request: NextRequest): boolean {
  for (const cookie of request.cookies.getAll()) {
    for (const prefix of SESSION_COOKIE_PREFIXES) {
      if (
        (cookie.name === prefix || cookie.name.startsWith(`${prefix}.`)) &&
        cookie.value
      ) {
        return true;
      }
    }
  }

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/login");
  const isPublicApi = pathname.startsWith("/api/auth");
  const isDevApi = pathname.startsWith("/api/dev");

  if (isPublicApi || isDevApi) {
    return NextResponse.next();
  }

  const isLoggedIn = hasAuthSessionCookie(request);

  if (!isLoggedIn && !isLogin) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/schedule", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|offline|assets).*)",
  ],
};
