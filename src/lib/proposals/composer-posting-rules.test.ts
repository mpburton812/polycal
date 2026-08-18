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

describe("assertComposerPostingRules (PC-427–PC-428)", () => {
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

  it("rejects booking posting when the network is Just Proposals", () => {
    const result = assertComposerPostingRules({ ...base, postingKind: "booking" });
    expect(result.ok).toBe(false);
  });

  it("rejects poll combined with booking posting", () => {
    const result = assertComposerPostingRules({
      ...base,
      schedulingPosting: "proposals_and_bookings",
      postingKind: "booking",
      isPoll: true,
    });
    expect(result.ok).toBe(false);
  });

  it("allows Booking for even when the legacy proxy flag is off", () => {
    expect(
      assertComposerPostingRules({
        ...base,
        schedulingPosting: "proposals_and_bookings",
        proxySchedulingEnabled: false,
        postingKind: "booking",
        onBehalfOfUserId: "leia",
      }),
    ).toEqual({ ok: true });
  });

  it("allows Booking for an in-scope partner", () => {
    expect(
      assertComposerPostingRules({
        ...base,
        schedulingPosting: "proposals_and_bookings",
        proxySchedulingEnabled: true,
        postingKind: "booking",
        onBehalfOfUserId: "leia",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects Booking for someone outside the scope list", () => {
    const result = assertComposerPostingRules({
      ...base,
      schedulingPosting: "proposals_and_bookings",
      proxySchedulingEnabled: true,
      postingKind: "booking",
      onBehalfOfUserId: "han",
    });
    expect(result.ok).toBe(false);
  });
});
