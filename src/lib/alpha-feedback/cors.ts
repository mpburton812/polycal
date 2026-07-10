import { NextResponse } from "next/server";

/** CORS headers so the Tauri tracker (and local Vite) can call admin APIs (PC-121). */
export function alphaFeedbackCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin === "null" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, x-vercel-protection-bypass, x-vercel-set-bypass-cookie",
    Vary: "Origin",
  };
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
