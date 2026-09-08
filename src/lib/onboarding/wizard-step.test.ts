import { describe, expect, it } from "vitest";

import {
  canSelectOnboardingStep,
  ONBOARDING_CALENDAR_STEP,
  resolveOnboardingMaxUnlocked,
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

describe("resolveOnboardingMaxUnlocked", () => {
  it("stays on Email and Password while mustChangePassword", () => {
    expect(
      resolveOnboardingMaxUnlocked({
        mustChangePassword: true,
        storedMaxUnlocked: "4",
        activeStep: 0,
      }),
    ).toBe(0);
  });

  it("uses the max of fallback, stored, and active step", () => {
    expect(
      resolveOnboardingMaxUnlocked({
        mustChangePassword: false,
        storedMaxUnlocked: "2",
        activeStep: 3,
      }),
    ).toBe(3);
  });
});

describe("canSelectOnboardingStep", () => {
  it("allows only unlocked indices", () => {
    expect(canSelectOnboardingStep(0, 2)).toBe(true);
    expect(canSelectOnboardingStep(2, 2)).toBe(true);
    expect(canSelectOnboardingStep(3, 2)).toBe(false);
  });
});
