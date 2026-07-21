import { NextResponse } from "next/server";

import { getAppEnvironment } from "@/lib/env";

/** Local tracker / Vite / Tauri origins always allowed alongside the env allowlist. */
const TRACKER_LOCALHOST_ORIGINS = new Set([
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "tauri://localhost",
  "http://tauri.localhost",
]);

/**
 * Parses `ALPHA_FEEDBACK_CORS_ORIGINS` (comma-separated) into a normalized set.
 */
function configuredCorsOrigins(): Set<string> {
  const raw = process.env.ALPHA_FEEDBACK_CORS_ORIGINS ?? "";
  const origins = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return new Set(origins);
}

/**
 * Resolves the Access-Control-Allow-Origin value for an alpha-feedback request.
 * Production: allowlist only (env + tracker localhost variants). Non-prod: reflect.
 * Returns undefined when the origin must be rejected (no ACAO header).
 */
export function resolveAlphaFeedbackAllowOrigin(
  request: Request,
): string | undefined {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") {
    // Non-browser / same-origin callers — omit ACAO rather than reflecting "*".
    if (getAppEnvironment() === "production") {
      return undefined;
    }
    return "*";
  }

  if (getAppEnvironment() !== "production") {
    return origin;
  }

  if (TRACKER_LOCALHOST_ORIGINS.has(origin) || configuredCorsOrigins().has(origin)) {
    return origin;
  }
  return undefined;
}

/** CORS headers so the Tauri tracker (and local Vite) can call admin APIs (PC-121 / PC-282). */
export function alphaFeedbackCorsHeaders(request: Request): HeadersInit {
  const allowOrigin = resolveAlphaFeedbackAllowOrigin(request);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, x-vercel-protection-bypass, x-vercel-set-bypass-cookie",
    Vary: "Origin",
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}

/** Wraps a JSON response with CORS headers. */
export function withAlphaFeedbackCors(
  request: Request,
  response: NextResponse,
): NextResponse {
  const headers = alphaFeedbackCorsHeaders(request);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/** Preflight response for alpha-feedback admin routes. */
export function alphaFeedbackOptions(request: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: alphaFeedbackCorsHeaders(request),
  });
}
