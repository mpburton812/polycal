import { describe, expect, it } from "vitest";

import { submitNotificationMessage, submitResultMessage } from "./submit-copy";

describe("submit copy when proposals are disabled", () => {
  it("says the actor booked the event", () => {
    expect(
      submitResultMessage({ autoResolve: true, schedulingPosting: "bookings_only" }),
    ).toBe("Booked.");
    expect(
      submitNotificationMessage({
        autoResolve: true,
        schedulingPosting: "bookings_only",
        actorDisplayName: "Alex",
        title: "Dinner",
      }),
    ).toBe('Alex booked "Dinner".');
  });

  it("keeps auto-approved wording and names the actor when proposals are on", () => {
    expect(
      submitNotificationMessage({
        autoResolve: true,
        schedulingPosting: "proposals_only",
        actorDisplayName: "Alex",
        title: "Dinner",
      }),
    ).toBe('Alex\'s proposal "Dinner" was auto-approved.');
  });
});
