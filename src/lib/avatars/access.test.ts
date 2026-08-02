import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-access", () => ({
  userHasAdminAccess: vi.fn(),
  adminAccessFromUserRow: vi.fn(({ role }: { role: string }) => ({
    role,
    activeNetworkRole: role === "admin" ? "network_admin" : undefined,
  })),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { canViewerAccessCustomAvatar } from "./access";

describe("canViewerAccessCustomAvatar", () => {
  beforeEach(() => {
    vi.mocked(userHasAdminAccess).mockReset();
    vi.mocked(getDb).mockReset();
  });

  it("allows the owner", async () => {
    const allowed = await canViewerAccessCustomAvatar("u1", "user", "u1");
    expect(allowed).toBe(true);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("allows admins", async () => {
    vi.mocked(userHasAdminAccess).mockResolvedValue(true);
    const allowed = await canViewerAccessCustomAvatar("admin", "admin", "u2");
    expect(allowed).toBe(true);
  });

  it("allows accepted sleeping partners", async () => {
    vi.mocked(userHasAdminAccess).mockResolvedValue(false);
    vi.mocked(getDb).mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: 1 }],
          }),
        }),
      }),
    } as never);

    const allowed = await canViewerAccessCustomAvatar("u1", "user", "u2");
    expect(allowed).toBe(true);
  });

  it("denies unrelated users", async () => {
    vi.mocked(userHasAdminAccess).mockResolvedValue(false);
    vi.mocked(getDb).mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as never);

    const allowed = await canViewerAccessCustomAvatar("u1", "user", "u2");
    expect(allowed).toBe(false);
  });
});
