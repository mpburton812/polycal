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

  it("installs Chromium without apt --with-deps so shards cannot hang on OS packages", () => {
    for (const name of ["e2e.yml", "production.yml"]) {
      const workflow = readWorkflow(name);
      expect(workflow).toContain("npx playwright install chromium");
      expect(workflow).not.toContain("install chromium --with-deps");
      expect(workflow).toMatch(/timeout-minutes:\s*5/);
    }
  });

  it("documents the same Playwright install policy in .cursorrules", () => {
    const rules = readFileSync(path.join(process.cwd(), ".cursorrules"), "utf8");
    expect(rules).toContain("npx playwright install chromium");
    expect(rules).not.toContain("install chromium --with-deps");
    expect(rules).toContain("gh pr create");
    expect(rules).not.toContain("ManagePullRequest");
  });
});
