import { describe, expect, it } from "vitest";

import {
  EVENT_ICON_KEYS,
  EVENT_ICON_REGISTRY,
  getEventIconDefinition,
  isEventIconKey,
} from "@/lib/event-icons/registry";

describe("event icon registry", () => {
  it("exposes ten unique keys with labels", () => {
    expect(EVENT_ICON_KEYS).toHaveLength(10);
    expect(new Set(EVENT_ICON_KEYS).size).toBe(10);
    expect(EVENT_ICON_REGISTRY).toHaveLength(10);
    for (const entry of EVENT_ICON_REGISTRY) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.a11yLabel.length).toBeGreaterThan(0);
    }
  });

  it("labels Sexy Times for the flame icon", () => {
    expect(getEventIconDefinition("sexy_flame")?.label).toBe("Sexy Times");
  });

  it("validates known keys only", () => {
    expect(isEventIconKey("gaming_meeple")).toBe(true);
    expect(isEventIconKey("unknown")).toBe(false);
    expect(isEventIconKey(null)).toBe(false);
  });
});
