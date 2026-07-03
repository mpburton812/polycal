import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const revision = crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision }],
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  env: {
    NEXT_PUBLIC_BUILD_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    NEXT_PUBLIC_BUILD_BRANCH:
      process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default withSerwist(nextConfig);
