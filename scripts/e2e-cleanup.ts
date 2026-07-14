/**
 * Clears e2e SQLite files and frees Playwright ports after crashed multi-server runs (PC-214).
 *
 * Usage: `npm run test:e2e:cleanup`
 */
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

import { E2E_PORT } from "../e2e/e2e-env";
import { resolveServerCount } from "../e2e/parallel";

const cwd = process.cwd();
const serverCount = resolveServerCount();
const ports = Array.from({ length: Math.max(serverCount, 4) }, (_, i) => E2E_PORT + i);

function unlinkDbFamily(baseName: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = path.join(cwd, `${baseName}${suffix}`);
    if (existsSync(file)) {
      try {
        unlinkSync(file);
        console.log(`[e2e:cleanup] removed ${path.basename(file)}`);
      } catch (error) {
        console.warn(`[e2e:cleanup] could not remove ${file}:`, error);
      }
    }
  }
}

for (const entry of readdirSync(cwd)) {
  if (/^e2e(-w\d+)?\.db(-wal|-shm)?$/.test(entry)) {
    try {
      unlinkSync(path.join(cwd, entry));
      console.log(`[e2e:cleanup] removed ${entry}`);
    } catch (error) {
      console.warn(`[e2e:cleanup] could not remove ${entry}:`, error);
    }
  }
}

unlinkDbFamily("e2e.db");
for (let i = 0; i < serverCount + 2; i += 1) {
  unlinkDbFamily(`e2e-w${i}.db`);
}

if (process.platform === "win32") {
  for (const port of ports) {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const pids = new Set<string>();
      for (const line of out.split(/\r?\n/)) {
        const match = line.trim().match(/LISTENING\s+(\d+)\s*$/);
        if (match) pids.add(match[1]);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
          console.log(`[e2e:cleanup] killed PID ${pid} on port ${port}`);
        } catch {
          // Already gone.
        }
      }
    } catch {
      // findstr exits 1 when no match.
    }
  }
} else {
  for (const port of ports) {
    try {
      execSync(`fuser -k ${port}/tcp`, { stdio: "ignore" });
      console.log(`[e2e:cleanup] freed port ${port}`);
    } catch {
      // Nothing listening.
    }
  }
}

console.log(`[e2e:cleanup] done (checked ports ${ports[0]}–${ports[ports.length - 1]}).`);
