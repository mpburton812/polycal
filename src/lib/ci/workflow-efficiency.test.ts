import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readWorkflow(name: string): string {
  return readFileSync(path.join(process.cwd(), ".github", "workflows", name), "utf8");
}

describe("CI efficiency (PC-452)", () => {
  it("lets e2e.yml own the Next build on promotion PRs instead of duplicating it", () => {
    expect(readWorkflow("dev.yml")).not.toContain("npm run build");
    expect(readWorkflow("test.yml")).not.toContain("npm run build");
    expect(readWorkflow("e2e.yml")).toContain("npm run build");
  });

  it("caches Playwright browsers on production promotion", () => {
    const production = readWorkflow("production.yml");
    expect(production).toContain("Cache Playwright browsers");
    expect(production).toContain("~/.cache/ms-playwright");
  });
});
