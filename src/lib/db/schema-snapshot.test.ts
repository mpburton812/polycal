import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildSchemaSnapshot } from "./schema-snapshot";

describe("schema snapshot (PC-537)", () => {
  it("matches the committed Drizzle column list", () => {
    const committed = JSON.parse(
      readFileSync(path.join(process.cwd(), "src/lib/db/schema-snapshot.json"), "utf8"),
    ) as Record<string, string[]>;
    expect(buildSchemaSnapshot()).toEqual(committed);
  });
});
