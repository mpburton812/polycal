import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/admin-access", () => ({
  resolveAdminAccess: vi.fn(),
  adminAccessFromSessionUser: vi.fn((user) => user),
}));

vi.mock("@/lib/db/ensure-ready", () => ({
  ensureDbReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(() => ({ mock: true })),
}));

import { auth } from "@/lib/auth";
import { adminAccessFromSessionUser, resolveAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import {
  PAUSED_ACCOUNT_MESSAGE,
  requireAdminAccess,
  requireSession,
  withDb,
} from "./context";

describe("action context helpers", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(resolveAdminAccess).mockReset();
    vi.mocked(adminAccessFromSessionUser).mockReset();
    vi.mocked(adminAccessFromSessionUser).mockImplementation((user) => user);
  });

  it("requireSession returns error when unsigned", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const result = await requireSession();
    expect(result).toEqual({ ok: false, message: "Sign in required." });
  });

  it("requireSession returns user when signed in", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "user" },
      expires: "",
    } as never);
    const result = await requireSession();
    expect(result).toEqual({
      ok: true,
      user: { id: "u1", role: "user", isImpersonating: false },
    });
  });

  it("requireSession flags impersonating sessions", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "user", isImpersonating: true },
      expires: "",
    } as never);
    const result = await requireSession();
    expect(result).toEqual({
      ok: true,
      user: { id: "u1", role: "user", isImpersonating: true },
    });
  });

  it("requireSession rejects paused accounts (PC-353)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "user", accountStatus: "paused" },
      expires: "",
    } as never);
    const result = await requireSession();
    expect(result).toEqual({ ok: false, message: PAUSED_ACCOUNT_MESSAGE });
  });

  it("requireAdminAccess denies a paused admin (PC-353)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "admin", accountStatus: "paused" },
      expires: "",
    } as never);
    vi.mocked(resolveAdminAccess).mockReturnValue(true);
    const result = await requireAdminAccess();
    expect(result).toEqual({ ok: false, message: PAUSED_ACCOUNT_MESSAGE });
    expect(resolveAdminAccess).not.toHaveBeenCalled();
  });

  it("requireAdminAccess checks resolveAdminAccess", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "user" },
      expires: "",
    } as never);
    vi.mocked(resolveAdminAccess).mockReturnValue(false);
    const denied = await requireAdminAccess();
    expect(denied).toEqual({ ok: false, message: "Admin access required." });

    vi.mocked(resolveAdminAccess).mockReturnValue(true);
    const allowed = await requireAdminAccess();
    expect(allowed.ok).toBe(true);
  });

  it("withDb ensures ready and passes db handle", async () => {
    const value = await withDb(async (db) => {
      expect(db).toEqual({ mock: true });
      return 42;
    });
    expect(value).toBe(42);
    expect(getDb).toHaveBeenCalled();
  });
});
