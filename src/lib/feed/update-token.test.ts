import { describe, expect, it } from "vitest";

import {
  composeFeedFingerprint,
  type FeedFingerprintActiveEvent,
  type FeedFingerprintInput,
} from "@/lib/feed/update-token";

const activeEvent: FeedFingerprintActiveEvent = {
  proposalId: "p1",
  scheduledStartAt: "2026-07-16T11:00:00.000Z",
  scheduledEndAt: "2026-07-16T13:00:00.000Z",
  proposalState: "resolved",
};

function baseInput(overrides: Partial<FeedFingerprintInput> = {}): FeedFingerprintInput {
  return {
    milestones: { count: 2, maxCreatedAt: "2026-07-16T12:00:00.000Z" },
    proposals: { maxUpdatedAt: "2026-07-16T12:00:00.000Z" },
    chatMessages: { count: 3, maxCreatedAt: "2026-07-16T12:01:00.000Z", maxDeletedAt: null },
    chatComments: { count: 1, maxCreatedAt: "2026-07-16T12:02:00.000Z", maxDeletedAt: null },
    proposalComments: { count: 1, maxCreatedAt: "2026-07-16T12:03:00.000Z", maxDeletedAt: null },
    likes: { count: 4, maxCreatedAt: "2026-07-16T12:04:00.000Z", maxDeletedAt: null, viewerCount: 1 },
    activeEvents: [activeEvent],
    ...overrides,
  };
}

describe("composeFeedFingerprint", () => {
  it("is stable for identical aggregates", () => {
    expect(composeFeedFingerprint(baseInput())).toBe(composeFeedFingerprint(baseInput()));
  });

  it("changes when a milestone is added", () => {
    const before = composeFeedFingerprint(baseInput());
    const after = composeFeedFingerprint(
      baseInput({ milestones: { count: 3, maxCreatedAt: "2026-07-16T12:05:00.000Z" } }),
    );
    expect(before).not.toBe(after);
  });

  it("changes when a chat message is added", () => {
    const before = composeFeedFingerprint(baseInput());
    const after = composeFeedFingerprint(
      baseInput({
        chatMessages: { count: 4, maxCreatedAt: "2026-07-16T12:06:00.000Z", maxDeletedAt: null },
      }),
    );
    expect(before).not.toBe(after);
  });

  it("changes when a chat message is soft-deleted", () => {
    const before = composeFeedFingerprint(baseInput());
    const after = composeFeedFingerprint(
      baseInput({
        chatMessages: {
          count: 3,
          maxCreatedAt: "2026-07-16T12:01:00.000Z",
          maxDeletedAt: "2026-07-16T12:10:00.000Z",
        },
      }),
    );
    expect(before).not.toBe(after);
  });

  it("changes when a proposal comment is added", () => {
    const before = composeFeedFingerprint(baseInput());
    const after = composeFeedFingerprint(
      baseInput({
        proposalComments: { count: 2, maxCreatedAt: "2026-07-16T12:07:00.000Z", maxDeletedAt: null },
      }),
    );
    expect(before).not.toBe(after);
  });

  it("changes when a like is added", () => {
    const before = composeFeedFingerprint(baseInput());
    const after = composeFeedFingerprint(
      baseInput({
        likes: { count: 5, maxCreatedAt: "2026-07-16T12:08:00.000Z", maxDeletedAt: null, viewerCount: 1 },
      }),
    );
    expect(before).not.toBe(after);
  });

  it("changes when the viewer's own like count changes (multi-device)", () => {
    const before = composeFeedFingerprint(baseInput());
    const after = composeFeedFingerprint(
      baseInput({
        likes: { count: 4, maxCreatedAt: "2026-07-16T12:04:00.000Z", maxDeletedAt: null, viewerCount: 2 },
      }),
    );
    expect(before).not.toBe(after);
  });

  it("changes when the active-event stack changes", () => {
    const before = composeFeedFingerprint(baseInput({ activeEvents: [] }));
    const after = composeFeedFingerprint(baseInput({ activeEvents: [activeEvent] }));
    expect(before).not.toBe(after);
  });

  it("changes when a proposal is edited", () => {
    const before = composeFeedFingerprint(baseInput());
    const after = composeFeedFingerprint(
      baseInput({ proposals: { maxUpdatedAt: "2026-07-16T12:09:00.000Z" } }),
    );
    expect(before).not.toBe(after);
  });
});
