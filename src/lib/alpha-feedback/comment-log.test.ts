import { describe, expect, it } from "vitest";

import {
  appendAlphaFeedbackCommentLog,
  parseAlphaFeedbackCommentLog,
} from "./comment-log";

describe("alpha feedback comment log", () => {
  it("parses empty and invalid payloads as empty arrays", () => {
    expect(parseAlphaFeedbackCommentLog(null)).toEqual([]);
    expect(parseAlphaFeedbackCommentLog("not-json")).toEqual([]);
  });

  it("appends a dated entry and skips blank drafts", () => {
    expect(
      appendAlphaFeedbackCommentLog(null, { internalComment: "  ", submitterComment: "" }),
    ).toBeNull();

    const result = appendAlphaFeedbackCommentLog(
      "[]",
      { internalComment: "looks real", submitterComment: "thanks" },
      "2026-07-12T18:00:00.000Z",
    );
    expect(result?.entry).toEqual({
      at: "2026-07-12T18:00:00.000Z",
      internalComment: "looks real",
      submitterComment: "thanks",
    });
    expect(JSON.parse(result!.logJson)).toHaveLength(1);
  });
});
