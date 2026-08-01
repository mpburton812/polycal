import { describe, expect, it } from "vitest";

import { reminderOffsetToMinutes, minutesToReminderDisplay } from "@/lib/proposals/event-reminder";
import { migrateAlertTypes } from "@/types/notification-prefs";

describe("event-reminder", () => {
  it("converts units to minutes", () => {
    expect(reminderOffsetToMinutes(2, "days")).toBe(2880);
    expect(reminderOffsetToMinutes(3, "hours")).toBe(180);
    expect(reminderOffsetToMinutes(15, "minutes")).toBe(15);
  });

  it("formats stored minutes for display", () => {
    expect(minutesToReminderDisplay(120)).toEqual({
      enabled: true,
      value: 2,
      unit: "hours",
    });
  });
});

describe("migrateAlertTypes", () => {
  it("maps legacy proposal/partnership/event toggles", () => {
    expect(
      migrateAlertTypes({ proposals: false, partnerships: true, events: false }),
    ).toEqual({
      sleepingProposals: false,
      eventProposals: false,
      sleepingPartnerProposals: true,
      reminders: false,
      feedChatReplies: true,
    });
  });
});
