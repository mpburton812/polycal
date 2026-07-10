/**
 * Compatibility tests — canonical coverage lives in
 * `src/lib/proposals/fast-sleeping-plan.test.ts` (PC-114).
 */
import { describe, expect, it } from "vitest";

import {
  adminFastSleepingPlanSchema,
  buildBatchEntriesFromRows,
  fastSleepingRowHasContent,
} from "@/lib/proposals/fast-sleeping-plan";

describe("admin fast sleeping plan (compat)", () => {
  it("accepts a valid admin payload", () => {
    const result = adminFastSleepingPlanSchema.safeParse({
      targetUserId: "user-1",
      rows: [{ nightDate: "2099-07-01", inviteeUserIds: ["p1"] }],
    });
    expect(result.success).toBe(true);
  });

  it("maps rows via shared builder", () => {
    expect(fastSleepingRowHasContent({ nightDate: "2099-07-01", inviteeUserIds: ["p1"] })).toBe(
      true,
    );
    const entries = buildBatchEntriesFromRows([
      { nightDate: "2099-07-01", inviteeUserIds: ["p1"] },
    ]);
    expect(entries[0]?.invitees[0]?.role).toBe("required");
  });
});
