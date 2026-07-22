import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
}));

import { notifyUser } from "@/lib/notifications";
import { notifyProposalParticipants } from "./notify-participants";

type InviteeRow = { userId: string; role: string | null; voteStatus: string | null };

/** Minimal db stand-in returning the given invitee rows from the select chain. */
function fakeDb(invitees: InviteeRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: async () => invitees,
      }),
    }),
  } as never;
}

describe("notifyProposalParticipants", () => {
  beforeEach(() => {
    vi.mocked(notifyUser).mockClear();
  });

  it("notifies proposer and invitees once, deduplicating overlaps", async () => {
    const db = fakeDb([
      { userId: "invitee-1", role: "required", voteStatus: "accept" },
      { userId: "proposer", role: "optional", voteStatus: "not_seen" },
    ]);

    await notifyProposalParticipants(db, {
      proposalId: "prop-1",
      proposerId: "proposer",
      notificationType: "proposal_resolved",
      message: "hello",
    });

    const targets = vi.mocked(notifyUser).mock.calls.map((call) => call[0]);
    expect(new Set(targets)).toEqual(new Set(["proposer", "invitee-1"]));
    // proposer appears in both proposer + invitee set but is only notified once
    expect(targets.filter((id) => id === "proposer")).toHaveLength(1);
  });

  it("injects proposalId and merges shared metadata into every payload", async () => {
    const db = fakeDb([{ userId: "invitee-1", role: "required", voteStatus: "not_seen" }]);

    await notifyProposalParticipants(db, {
      proposalId: "prop-1",
      proposerId: "proposer",
      notificationType: "proposal_reverted_to_draft",
      message: "back to draft",
      metadata: { reason: "no invitees", proposalType: "event" },
    });

    for (const call of vi.mocked(notifyUser).mock.calls) {
      expect(call[1]).toBe("proposal_reverted_to_draft");
      expect(call[2]).toBe("back to draft");
      expect(call[3]).toMatchObject({
        proposalId: "prop-1",
        reason: "no invitees",
        proposalType: "event",
      });
    }
  });

  it("supports per-recipient message + metadata overrides (proposer vs invitee)", async () => {
    const db = fakeDb([{ userId: "invitee-1", role: "required", voteStatus: "accept" }]);

    await notifyProposalParticipants(db, {
      proposalId: "prop-1",
      proposerId: "proposer",
      notificationType: "proposal_at_risk",
      metadata: { proposalType: "sleeping" },
      message: ({ isProposer }) => (isProposer ? "you own this" : "tentative for you"),
      metadataFor: ({ isProposer }) =>
        isProposer ? { action: "at_risk_options" } : { action: "vote" },
    });

    const byUser = new Map(
      vi.mocked(notifyUser).mock.calls.map((call) => [call[0], { message: call[2], meta: call[3] }]),
    );
    expect(byUser.get("proposer")).toMatchObject({
      message: "you own this",
      meta: { proposalId: "prop-1", proposalType: "sleeping", action: "at_risk_options" },
    });
    expect(byUser.get("invitee-1")).toMatchObject({
      message: "tentative for you",
      meta: { proposalId: "prop-1", proposalType: "sleeping", action: "vote" },
    });
  });

  it("resolves message from invitee role/voteStatus context", async () => {
    const db = fakeDb([
      { userId: "optional-pending", role: "optional", voteStatus: "not_seen" },
      { userId: "required-done", role: "required", voteStatus: "accept" },
    ]);

    await notifyProposalParticipants(db, {
      proposalId: "prop-1",
      proposerId: "proposer",
      notificationType: "proposal_resolved",
      message: ({ role, voteStatus }) =>
        role === "optional" && voteStatus === "not_seen" ? "please vote" : "scheduled",
    });

    const byUser = new Map(
      vi.mocked(notifyUser).mock.calls.map((call) => [call[0], call[2]]),
    );
    expect(byUser.get("optional-pending")).toBe("please vote");
    expect(byUser.get("required-done")).toBe("scheduled");
    expect(byUser.get("proposer")).toBe("scheduled");
  });
});
