import { createHmac, timingSafeEqual } from "node:crypto";

import type { UserRole } from "@/types/user";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_PREFIX = "afbadminv1";

export interface AdminApiUser {
  id: string;
  role: UserRole;
  displayName: string;
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is required for admin API tokens.");
  }
  return secret;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payloadJson: string): string {
  return createHmac("sha256", getAuthSecret()).update(payloadJson).digest("base64url");
}

/**
 * Issues a short-lived HMAC bearer token for the alpha-feedback tracker (PC-121).
 */
export function issueAdminApiToken(user: AdminApiUser): string {
  const payload = {
    sub: user.id,
    role: user.role,
    name: user.displayName,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadJson = JSON.stringify(payload);
  return `${TOKEN_PREFIX}.${b64url(payloadJson)}.${signPayload(payloadJson)}`;
}

/**
 * Verifies an alpha-feedback admin bearer token.
 */
export function verifyAdminApiToken(token: string): AdminApiUser | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, payloadB64, signature] = parts;
  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = signPayload(payloadJson);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(payloadJson) as {
      sub?: string;
      role?: UserRole;
      name?: string;
      exp?: number;
    };
    if (!payload.sub || !payload.role || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return {
      id: payload.sub,
      role: payload.role,
      displayName: payload.name ?? "Admin",
    };
  } catch {
    return null;
  }
}
