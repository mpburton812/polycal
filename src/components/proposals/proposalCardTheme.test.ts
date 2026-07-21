import { describe, expect, it, vi } from "vitest";

import { sleepingDateToStartIso } from "@/lib/proposals/sleeping-schedule";
import { isAdminOversightView, isPastSchedule } from "./proposalCardTheme";

describe("isAdminOversightView", () => {
  it("is true when admin views another user's proposal and is not an invitee", () => {
    expect(isAdminOversightView(true, "admin-1", "user-2")).toBe(true);
    expect(isAdminOversightView(true, "admin-1", "user-2", false)).toBe(true);
  });

  it("is false when admin is an invitee", () => {
    expect(isAdminOversightView(true, "admin-1", "user-2", true)).toBe(false);
  });

  it("is false for the proposer's own cards", () => {
    expect(isAdminOversightView(true, "admin-1", "admin-1")).toBe(false);
  });

  it("is false for non-admins", () => {
    expect(isAdminOversightView(false, "user-1", "user-2")).toBe(false);
  });

  it("is false when proposer is missing", () => {
    expect(isAdminOversightView(true, "admin-1", null)).toBe(false);
    expect(isAdminOversightView(true, "admin-1", undefined)).toBe(false);
  });
});

describe("isPastSchedule", () => {
  it("treats events as past once their start timestamp elapses", () => {
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    expect(isPastSchedule("2026-07-15T11:00:00.000Z", "event")).toBe(true);
    expect(isPastSchedule("2026-07-15T13:00:00.000Z", "event")).toBe(false);
    vi.useRealTimers();
  });

  it("treats sleeping nights as past only once the whole calendar day elapses (PC-280)", () => {
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    // Sleeping nights are stored as local-midnight ISO (sleepingDateToStartIso) — a raw
    // timestamp compare would wrongly call "today" past by noon; sleeping should stay
    // current until end of day.
    const today = sleepingDateToStartIso("2026-07-15")!;
    const yesterday = sleepingDateToStartIso("2026-07-14")!;
    expect(isPastSchedule(today, "sleeping")).toBe(false);
    expect(isPastSchedule(yesterday, "sleeping")).toBe(true);
    vi.useRealTimers();
  });
});
