import { describe, expect, it } from "vitest";

import {
  buildCredentialsEmailContent,
  buildPasswordResetEmailContent,
  buildVerifyEmailContent,
} from "@/lib/email/templates";
import { shouldSuppressEmailDelivery } from "@/lib/notifications";
import type { NotificationPrefs } from "@/types/notification-prefs";
import { DEFAULT_NOTIFICATION_PREFS } from "@/types/notification-prefs";

function prefsWithQuietHours(
  overrides: Partial<NotificationPrefs> = {},
): NotificationPrefs {
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    channels: { ...DEFAULT_NOTIFICATION_PREFS.channels, email: true, inApp: true },
    ...overrides,
  };
}

describe("email templates", () => {
  it("builds verify email with absolute link", () => {
    const content = buildVerifyEmailContent("https://example.com/verify-email?token=abc");
    expect(content.subject).toContain("Verify");
    expect(content.html).toContain("https://example.com/verify-email?token=abc");
    expect(content.text).toContain("expires in 24 hours");
  });

  it("escapes credentials HTML", () => {
    const content = buildCredentialsEmailContent({
      username: "a<b>",
      password: "x&y",
      loginUrl: "https://example.com/login",
    });
    expect(content.html).toContain("a&lt;b&gt;");
    expect(content.html).toContain("x&amp;y");
  });

  it("builds password reset content", () => {
    const content = buildPasswordResetEmailContent("https://example.com/reset-password?token=t1");
    expect(content.html).toContain("/reset-password?token=t1");
    expect(content.text).toContain("1 hour");
  });
});

describe("shouldSuppressEmailDelivery", () => {
  it("does not suppress outside quiet hours", () => {
    const prefs = prefsWithQuietHours();
    expect(shouldSuppressEmailDelivery(prefs, "proposal_submitted", new Date("2026-07-11T12:00:00"))).toBe(
      false,
    );
  });

  it("suppresses email during quiet hours when other channels exist", () => {
    const prefs = prefsWithQuietHours();
    expect(shouldSuppressEmailDelivery(prefs, "proposal_submitted", new Date("2026-07-11T23:00:00"))).toBe(
      true,
    );
  });

  it("does not suppress when email is the only channel", () => {
    const prefs = prefsWithQuietHours({
      channels: { inApp: false, email: true, sms: false, push: false },
    });
    expect(shouldSuppressEmailDelivery(prefs, "proposal_submitted", new Date("2026-07-11T23:00:00"))).toBe(
      false,
    );
  });

  it("never suppresses urgent password_reset", () => {
    const prefs = prefsWithQuietHours();
    expect(shouldSuppressEmailDelivery(prefs, "password_reset", new Date("2026-07-11T23:00:00"))).toBe(
      false,
    );
  });
});
