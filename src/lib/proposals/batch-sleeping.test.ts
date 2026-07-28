import { describe, expect, it } from "vitest";

import { batchSleepingEntriesSchema } from "./batch-sleeping";

describe("batchSleepingEntriesSchema", () => {
  it("accepts up to 14 nights with invitees", () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({
      id: `night-${index}`,
      nightDate: `2099-07-${String(index + 1).padStart(2, "0")}`,
      intentionalSolo: false,
      invitees: [{ userId: "u2", role: "required" as const }],
    }));

    const result = batchSleepingEntriesSchema.safeParse(entries);
    expect(result.success).toBe(true);
  });

  it("rejects empty batch", () => {
    const result = batchSleepingEntriesSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects more than 28 nights", () => {
    const entries = Array.from({ length: 29 }, (_, index) => ({
      id: `night-${index}`,
      nightDate: "2099-07-01",
      intentionalSolo: true,
      invitees: [],
    }));

    const result = batchSleepingEntriesSchema.safeParse(entries);
    expect(result.success).toBe(false);
  });
});
