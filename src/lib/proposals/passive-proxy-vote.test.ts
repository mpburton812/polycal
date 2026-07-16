import { describe, expect, it } from "vitest";

import { actorCanProxyVoteSync } from "@/lib/proposals/passive-proxy-vote";

describe("actorCanProxyVoteSync", () => {
  const base = {
    actorUserId: "actor-1",
    proposerId: "proposer-1",
    sleepingPartnerIds: [] as string[],
  };

  it("allows admins", () => {
    expect(
      actorCanProxyVoteSync({
        ...base,
        isAdmin: true,
        actorUserId: "other",
      }),
    ).toBe(true);
  });

  it("allows the proposal proposer", () => {
    expect(
      actorCanProxyVoteSync({
        ...base,
        isAdmin: false,
        actorUserId: "proposer-1",
      }),
    ).toBe(true);
  });

  it("allows accepted sleeping partners of the proxy user", () => {
    expect(
      actorCanProxyVoteSync({
        ...base,
        isAdmin: false,
        actorUserId: "partner-1",
        sleepingPartnerIds: ["partner-1", "partner-2"],
      }),
    ).toBe(true);
  });

  it("denies unrelated users", () => {
    expect(
      actorCanProxyVoteSync({
        ...base,
        isAdmin: false,
        actorUserId: "stranger",
        sleepingPartnerIds: new Set(["partner-1"]),
      }),
    ).toBe(false);
  });
});
