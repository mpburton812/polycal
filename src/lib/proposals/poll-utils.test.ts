import { describe, expect, it } from "vitest";

import {
  optionalInviteeVotesPending,
  optionalPollVotesPending,
} from "./poll-utils";

describe("optionalInviteeVotesPending", () => {
  it("is true for unresolved optional RSVP on a resolved proposal", () => {
    expect(
      optionalInviteeVotesPending(
        { state: "resolved" },
        { role: "optional", voteStatus: "not_seen" },
      ),
    ).toBe(true);
  });

  it("is false once the optional invitee has voted", () => {
    expect(
      optionalInviteeVotesPending(
        { state: "resolved" },
        { role: "optional", voteStatus: "accept" },
      ),
    ).toBe(false);
  });

  it("is false for required invitees and non-resolved states", () => {
    expect(
      optionalInviteeVotesPending(
        { state: "resolved" },
        { role: "required", voteStatus: "not_seen" },
      ),
    ).toBe(false);
    expect(
      optionalInviteeVotesPending(
        { state: "proposed" },
        { role: "optional", voteStatus: "not_seen" },
      ),
    ).toBe(false);
  });

  it("is false when the viewer is not an invitee", () => {
    expect(optionalInviteeVotesPending({ state: "resolved" }, undefined)).toBe(false);
  });
});

describe("optionalPollVotesPending alias", () => {
  it("ignores poll slot count and matches optionalInviteeVotesPending", () => {
    expect(
      optionalPollVotesPending(
        { state: "resolved", isPoll: false },
        { role: "optional", voteStatus: "not_seen" },
        0,
      ),
    ).toBe(true);
    expect(
      optionalPollVotesPending(
        { state: "resolved", isPoll: true },
        { role: "optional", voteStatus: "not_seen" },
        1,
      ),
    ).toBe(true);
  });
});
