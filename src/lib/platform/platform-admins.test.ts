import { describe, expect, it } from "vitest";

import { isPlatformAdminIdentity } from "@/lib/platform/platform-admins";

describe("isPlatformAdminIdentity", () => {
  it("recognizes mpburton by username", () => {
    expect(isPlatformAdminIdentity({ username: "mpburton" })).toBe(true);
    expect(isPlatformAdminIdentity({ username: "MPBURTON" })).toBe(true);
  });

  it("recognizes mpburton@gmail.com by notification email", () => {
    expect(
      isPlatformAdminIdentity({ notificationEmail: "mpburton@gmail.com" }),
    ).toBe(true);
    expect(
      isPlatformAdminIdentity({ notificationEmail: "MPBURTON@GMAIL.COM" }),
    ).toBe(true);
  });

  it("rejects other users", () => {
    expect(isPlatformAdminIdentity({ username: "kthompson" })).toBe(false);
    expect(
      isPlatformAdminIdentity({ notificationEmail: "other@example.com" }),
    ).toBe(false);
  });
});
