import { describe, expect, it } from "vitest";

import { assertComposerPostingRules } from "./composer-posting-rules";

const base = {
  pollEnabled: true,
  schedulingPosting: "proposals_only" as const,
  proxySchedulingEnabled: false,
  proxySchedulingScope: "sleeping_partners" as const,
  isPoll: false,
  isExistingPollDraft: false,
  postingKind: "proposal" as const,
  onBehalfOfUserId: null as string | null,
  actorUserId: "luke",
  allowedProxyUserIds: new Set(["leia"]),
};

describe("assertComposerPostingRules (PC-423–425)", () => {
  it("allows a normal proposal", () => {
    expect(assertComposerPostingRules(base)).toEqual({ ok: true });
  });

  it("rejects poll on a new draft when Poll is off", () => {
    const result = assertComposerPostingRules({ ...base, pollEnabled: false, isPoll: true });
    expect(result.ok).toBe(false);
  });

  it("grandfathers an existing poll draft when Poll is off", () => {
    expect(
      assertComposerPostingRules({
        ...base,
        pollEnabled: false,
        isPoll: true,
        isExistingPollDraft: true,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects schedule posting when the network is Just Proposals", () => {
    const result = assertComposerPostingRules({ ...base, postingKind: "schedule" });
    expect(result.ok).toBe(false);
  });

  it("rejects poll combined with schedule posting", () => {
    const result = assertComposerPostingRules({
      ...base,
      schedulingPosting: "proposals_and_schedule",
      postingKind: "schedule",
      isPoll: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects proxy when the pulldown should be hidden", () => {
    const result = assertComposerPostingRules({
      ...base,
      schedulingPosting: "proposals_and_schedule",
      postingKind: "schedule",
      onBehalfOfUserId: "leia",
    });
    expect(result.ok).toBe(false);
  });

  it("allows proxy for an in-scope partner", () => {
    expect(
      assertComposerPostingRules({
        ...base,
        schedulingPosting: "proposals_and_schedule",
        proxySchedulingEnabled: true,
        postingKind: "schedule",
        onBehalfOfUserId: "leia",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects proxy for someone outside the scope list", () => {
    const result = assertComposerPostingRules({
      ...base,
      schedulingPosting: "proposals_and_schedule",
      proxySchedulingEnabled: true,
      postingKind: "schedule",
      onBehalfOfUserId: "han",
    });
    expect(result.ok).toBe(false);
  });
});
