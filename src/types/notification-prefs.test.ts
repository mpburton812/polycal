import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_PREFS,
  migrateAlertTypes,
  migrateNotificationChannels,
  parseNotificationPrefs,
} from "@/types/notification-prefs";

describe("migrateAlertTypes", () => {
  it("maps legacy proposals/partnerships/events to PC-65 categories", () => {
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

describe("migrateNotificationChannels", () => {
  it("maps legacy device=true to both inApp and push", () => {
    expect(migrateNotificationChannels({ device: true, email: true })).toEqual({
      email: true,
      sms: false,
      inApp: true,
      push: true,
    });
  });

  it("maps legacy device=false to both inApp and push false", () => {
    expect(migrateNotificationChannels({ device: false })).toEqual({
      email: false,
      sms: false,
      inApp: false,
      push: false,
    });
  });

  it("prefers explicit inApp/push over legacy device", () => {
    expect(migrateNotificationChannels({ device: true, inApp: true, push: false })).toEqual({
      email: false,
      sms: false,
      inApp: true,
      push: false,
    });
  });
});

describe("parseNotificationPrefs", () => {
  it("returns defaults for null input", () => {
    expect(parseNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("migrates stored JSON with legacy device channel", () => {
    const stored = JSON.stringify({
      globalEnabled: true,
      channels: { email: false, sms: false, device: true },
    });
    const prefs = parseNotificationPrefs(stored);
    expect(prefs.channels.inApp).toBe(true);
    expect(prefs.channels.push).toBe(true);
  });

  it("preserves split inApp/push channels", () => {
    const stored = JSON.stringify({
      channels: { email: true, inApp: true, push: false },
    });
    const prefs = parseNotificationPrefs(stored);
    expect(prefs.channels).toEqual({
      email: true,
      sms: false,
      inApp: true,
      push: false,
    });
  });
});
