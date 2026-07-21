import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  isNonProductionEnvironment: vi.fn(),
  getAppEnvironment: vi.fn(),
}));

import { getAppEnvironment, isNonProductionEnvironment } from "@/lib/env";
import { getNonProductionLoginHint } from "./login-hint";

describe("getNonProductionLoginHint", () => {
  beforeEach(() => {
    vi.mocked(isNonProductionEnvironment).mockReset();
    vi.mocked(getAppEnvironment).mockReset();
  });

  it("returns null when environment is production", () => {
    vi.mocked(isNonProductionEnvironment).mockReturnValue(false);
    vi.mocked(getAppEnvironment).mockReturnValue("production");
    expect(getNonProductionLoginHint()).toBeNull();
  });

  it("returns a hint when non-production", () => {
    vi.mocked(isNonProductionEnvironment).mockReturnValue(true);
    vi.mocked(getAppEnvironment).mockReturnValue("dev");
    expect(getNonProductionLoginHint()).toMatch(/Dev seed:/);
  });
});
