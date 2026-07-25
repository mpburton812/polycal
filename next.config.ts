import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const revision = crypto.randomUUID();

// Captured when the build is produced (deploy time on Vercel); surfaced in the
// admin Code Status panel as "made live" for the current environment.
const buildTime = new Date().toISOString();

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
      bodySizeLimit: "4mb",
    },
    // Rewrites barrel imports to deep paths so MUI/dayjs only ship what is used,
    // cutting dev compile time and client bundle size (PC-355).
    optimizePackageImports: ["@mui/material", "@mui/icons-material", "dayjs"],
  },
  env: {
    NEXT_PUBLIC_BUILD_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    NEXT_PUBLIC_BUILD_BRANCH:
      process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        // img-src https: allows Open Graph preview images from arbitrary hosts (PC-282).
        // connect-src may need expansion later for Web Push / third-party endpoints.
        value:
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSerwist(nextConfig);
