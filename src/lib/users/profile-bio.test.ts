import { describe, expect, it } from "vitest";

import { profileBioSchema, PROFILE_BIO_MAX_LENGTH } from "@/lib/users/profile-bio";

describe("profileBioSchema", () => {
  it("accepts empty bio as null", () => {
    expect(profileBioSchema.parse("")).toBeNull();
    expect(profileBioSchema.parse(undefined)).toBeNull();
  });

  it("trims and stores text", () => {
    expect(profileBioSchema.parse("  Hello poly fam  ")).toBe("Hello poly fam");
  });

  it("rejects bios over the max length", () => {
    const long = "x".repeat(PROFILE_BIO_MAX_LENGTH + 1);
    expect(profileBioSchema.safeParse(long).success).toBe(false);
  });
});
