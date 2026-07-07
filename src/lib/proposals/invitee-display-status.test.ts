import { describe, expect, it } from "vitest";

import { inviteeDisplayLabel, inviteeVoteLabel } from "./invitee-display-status";

describe("inviteeDisplayLabel", () => {
  it("shows vote outcome when invitee has voted", () => {
    expect(inviteeDisplayLabel("accept", null)).toBe("Accepted");
    expect(inviteeDisplayLabel("abstain", "2026-06-01T00:00:00.000Z")).toBe("Abstained");
  });

  it('shows "Not yet viewed" when there is no vote and no viewed_at', () => {
    expect(inviteeDisplayLabel("not_seen", null)).toBe("Not yet viewed");
    expect(inviteeDisplayLabel("not_seen", undefined)).toBe("Not yet viewed");
  });

  it('shows "Pending response" when viewed but not yet voted', () => {
    expect(inviteeDisplayLabel("not_seen", "2026-06-01T00:00:00.000Z")).toBe("Pending response");
  });
});

describe("inviteeVoteLabel", () => {
  it("labels cast votes without view semantics", () => {
    expect(inviteeVoteLabel("not_seen")).toBe("No vote");
    expect(inviteeVoteLabel("accept_suboptimal")).toBe("Accepted sub-optimal");
  });
});
