import { describe, expect, it } from "vitest";

import {
  ONBOARDING_CALENDAR_STEP,
  resolveOnboardingStartStep,
} from "./wizard-step";

describe("resolveOnboardingStartStep", () => {
  it("defaults to password when mustChangePassword", () => {
    expect(
      resolveOnboardingStartStep({
        mustChangePassword: true,
        queryStep: null,
        storedStep: null,
      }),
    ).toBe(0);
  });

  it("defaults to avatar when password is already set", () => {
    expect(
      resolveOnboardingStartStep({
        mustChangePassword: false,
        queryStep: null,
        storedStep: null,
      }),
    ).toBe(1);
  });

  it("restores Calendar from OAuth query after Google connect", () => {
    expect(
      resolveOnboardingStartStep({
        mustChangePassword: false,
        queryStep: String(ONBOARDING_CALENDAR_STEP),
        storedStep: "2",
      }),
    ).toBe(ONBOARDING_CALENDAR_STEP);
  });

  it("falls back to sessionStorage when query is absent", () => {
    expect(
      resolveOnboardingStartStep({
        mustChangePassword: false,
        queryStep: null,
        storedStep: "3",
      }),
    ).toBe(3);
  });

  it("ignores stored/query steps while password is still required", () => {
    expect(
      resolveOnboardingStartStep({
        mustChangePassword: true,
        queryStep: "4",
        storedStep: "4",
      }),
    ).toBe(0);
  });

  it("ignores out-of-range steps", () => {
    expect(
      resolveOnboardingStartStep({
        mustChangePassword: false,
        queryStep: "99",
        storedStep: "-1",
      }),
    ).toBe(1);
  });
});
