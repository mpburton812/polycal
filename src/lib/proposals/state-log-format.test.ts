import { describe, expect, it } from "vitest";

import { formatProposalLogLine } from "./state-log-format";

const baseEntry = {
  actorName: "Leia Organa",
  createdAt: "2026-06-25T23:40:58.000Z",
};

describe("formatProposalLogLine", () => {
  it("formats action dots and actor name", () => {
    const line = formatProposalLogLine({
      ...baseEntry,
      action: "proposal.submitted",
      details: null,
    });
    expect(line).toContain("proposal · submitted");
    expect(line).toContain("Leia Organa");
  });

  it("expands attendee update details with names", () => {
    const line = formatProposalLogLine({
      ...baseEntry,
      action: "proposal.attendees_updated",
      details: JSON.stringify({
        addedRequired: ["Han Solo"],
        addedOptional: [],
        removedUserIds: [],
      }),
    });
    expect(line).toContain("added required: Han Solo");
  });

  it("formats vote cast details", () => {
    const line = formatProposalLogLine({
      ...baseEntry,
      action: "proposal.vote_cast",
      details: JSON.stringify({ vote: "accepted" }),
    });
    expect(line).toContain("accepted");
  });

  it("falls back to raw details when JSON is invalid", () => {
    const line = formatProposalLogLine({
      ...baseEntry,
      action: "proposal.comment_added",
      details: "plain text note",
    });
    expect(line).toContain("plain text note");
  });
});
