import { afterEach, describe, expect, it } from "vitest";

import {
  dbIndexForProject,
  includeMobileServer,
  mobileDbIndex,
  resolveParallelWorkers,
  resolveServerCount,
} from "../../../e2e/parallel";

describe("e2e parallel indexing (PC-213)", () => {
  const originalWorkers = process.env.E2E_PARALLEL_WORKERS;
  const originalMobile = process.env.E2E_INCLUDE_MOBILE;

  afterEach(() => {
    if (originalWorkers === undefined) delete process.env.E2E_PARALLEL_WORKERS;
    else process.env.E2E_PARALLEL_WORKERS = originalWorkers;
    if (originalMobile === undefined) delete process.env.E2E_INCLUDE_MOBILE;
    else process.env.E2E_INCLUDE_MOBILE = originalMobile;
  });

  it("defaults to 2 SAFE workers and dedicated mobile at w3", () => {
    delete process.env.E2E_PARALLEL_WORKERS;
    delete process.env.E2E_INCLUDE_MOBILE;
    expect(resolveParallelWorkers()).toBe(2);
    expect(mobileDbIndex()).toBe(3);
    expect(resolveServerCount()).toBe(4);
    expect(dbIndexForProject("chromium-serial", 0)).toBe(0);
    expect(dbIndexForProject("chromium-safe", 0)).toBe(1);
    expect(dbIndexForProject("chromium-safe", 1)).toBe(2);
    expect(dbIndexForProject("mobile-chrome", 0)).toBe(3);
  });

  it("workers=1 shares w0 for serial/safe and puts mobile on w1", () => {
    process.env.E2E_PARALLEL_WORKERS = "1";
    delete process.env.E2E_INCLUDE_MOBILE;
    expect(resolveServerCount()).toBe(2);
    expect(dbIndexForProject("chromium-safe", 0)).toBe(0);
    expect(dbIndexForProject("mobile-chrome", 0)).toBe(1);
  });

  it("E2E_INCLUDE_MOBILE=0 omits mobile slot from server count", () => {
    process.env.E2E_PARALLEL_WORKERS = "2";
    process.env.E2E_INCLUDE_MOBILE = "0";
    expect(includeMobileServer()).toBe(false);
    expect(resolveServerCount()).toBe(3);
    expect(dbIndexForProject("mobile-chrome", 0)).toBe(0);
  });
});
