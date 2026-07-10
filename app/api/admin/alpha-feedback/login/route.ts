import { NextResponse } from "next/server";
import { z } from "zod";

import { loginAdminApi } from "@/lib/alpha-feedback/admin-auth";
import {
  alphaFeedbackOptions,
  withAlphaFeedbackCors,
} from "@/lib/alpha-feedback/cors";
import { checkRateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export function OPTIONS(request: Request): NextResponse {
  return alphaFeedbackOptions(request);
}

/**
 * Issues a bearer token for the alpha-feedback Windows tracker (PC-121).
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "Invalid JSON." }, { status: 400 }),
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "Invalid credentials." }, { status: 400 }),
    );
  }

  const rateKey = `alpha-feedback-login:${parsed.data.username.toLowerCase()}`;
  if (!checkRateLimit(rateKey, 10, 60_000)) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "Too many attempts." }, { status: 429 }),
    );
  }

  const result = await loginAdminApi(parsed.data.username, parsed.data.password);
  if (!result.ok) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: result.message }, { status: 401 }),
    );
  }

  return withAlphaFeedbackCors(
    request,
    NextResponse.json({
      token: result.token,
      user: {
        id: result.user.id,
        displayName: result.user.displayName,
        role: result.user.role,
      },
    }),
  );
}
