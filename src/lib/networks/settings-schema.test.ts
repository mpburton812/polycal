import { describe, expect, it } from "vitest";

import { settingsPatchSchema } from "@/lib/networks/settings-schema";

describe("network settings patch validation (PC-461)", () => {
  it("accepts a single boolean patch", () => {
    const parsed = settingsPatchSchema.safeParse({ feedEnabled: false });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty object", () => {
    const parsed = settingsPatchSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown name that is too short", () => {
    const parsed = settingsPatchSchema.safeParse({ name: "" });
    expect(parsed.success).toBe(false);
  });
});
