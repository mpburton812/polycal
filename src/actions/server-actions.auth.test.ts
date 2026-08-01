import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/ensure-ready", () => ({
  ensureDbReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { exportMyDataAction } from "@/actions/account";
import { castProposalVoteAction } from "@/actions/proposals";
import { listScheduleEventsAction } from "@/actions/schedule";
import { deleteMyAccountAction } from "@/actions/users";

describe("server action auth guards", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("listScheduleEventsAction requires sign-in", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const result = await listScheduleEventsAction({
      rangeStart: "2099-01-01T00:00:00.000Z",
      rangeEnd: "2099-01-31T23:59:59.999Z",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Sign in required.");
    expect(result.payload.events).toEqual([]);
  });

  it("castProposalVoteAction requires sign-in", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const result = await castProposalVoteAction({
      proposalId: "00000000-0000-0000-0000-000000000001",
      vote: "accept",
    });
    expect(result).toEqual({ ok: false, message: "Sign in required." });
  });

  it("deleteMyAccountAction requires sign-in", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const result = await deleteMyAccountAction({
      password: "hunter2hunter2",
      confirmation: "DELETE MY ACCOUNT",
    });
    expect(result).toEqual({ ok: false, message: "Sign in required." });
  });

  it("exportMyDataAction requires sign-in", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const result = await exportMyDataAction();
    expect(result).toEqual({ ok: false, message: "Sign in required." });
  });
});
