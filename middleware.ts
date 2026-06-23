import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Edge-safe route guard — reads the Auth.js session JWT only (no @/lib/auth import).
 * Credentials provider and DB access stay in src/lib/auth.ts (Node runtime).
 */
function useSecureSessionCookie(request: NextRequest): boolean {
  if (process.env.VERCEL === "1") {
    return true;
  }

  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (authUrl?.startsWith("https://")) {
    return true;
  }

  return request.nextUrl.protocol === "https:";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/login");
  const isPublicApi = pathname.startsWith("/api/auth");
  const isDevApi = pathname.startsWith("/api/dev");

  if (isPublicApi || isDevApi) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: useSecureSessionCookie(request),
  });

  const isLoggedIn = !!token;

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
