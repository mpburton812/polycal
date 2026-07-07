import type { Session } from "next-auth";
import { vi } from "vitest";

import { auth } from "@/lib/auth";

/**
 * Mocks Auth.js `auth()` for server-action unit tests (PC-81).
 */
export function mockAuthSession(session: Session | null): void {
  vi.mocked(auth).mockResolvedValue(session);
}

/**
 * Clears the auth mock between tests.
 */
export function resetAuthMock(): void {
  vi.mocked(auth).mockReset();
}
