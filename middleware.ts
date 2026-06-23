import NextAuth from "next-auth";

import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isLogin = pathname.startsWith("/login");
  const isPublicApi = pathname.startsWith("/api/auth");
  const isDevApi = pathname.startsWith("/api/dev");

  if (isPublicApi || isDevApi) {
    return;
  }

  if (!isLoggedIn && !isLogin) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }

  if (isLoggedIn && isLogin) {
    return Response.redirect(new URL("/schedule", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|offline|assets).*)"],
};
