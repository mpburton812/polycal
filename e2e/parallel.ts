/**
 * SAFE_PARALLEL vs SERIAL_ONLY classification for Playwright projects (PC-176).
 * SAFE specs may run with workers > 1 against per-worker DBs; SERIAL stays workers:1.
 */

/** Specs safe for in-process parallel workers (isolated e2e-w{N}.db per worker). */
export const SAFE_PARALLEL_SPECS = [
  "admin-code-status-journey.spec.ts",
  "admin-schedule.spec.ts",
  "alert-prefs-journey.spec.ts",
  "batch-sleeping-journey.spec.ts",
  "batch-sleeping-partners-journey.spec.ts",
  "dates-times-journey.spec.ts",
  "event-icons.spec.ts",
  "event-reminder-journey.spec.ts",
  "multi-day-event-slice-journey.spec.ts",
  "navigation.spec.ts",
  "people-places.spec.ts",
  "privacy-masking.spec.ts",
  "profile.spec.ts",
  "proposals-board.spec.ts",
  "proposals-draft.spec.ts",
  "proposals-solo-comment-journey.spec.ts",
  "proposals-voting.spec.ts",
  "recurrence-slice-journey.spec.ts",
  "schedule.spec.ts",
  "sleeping-event-conflict-journey.spec.ts",
];

/** How many SAFE_PARALLEL worker DBs to start (in addition to serial w0). */
export function resolveParallelWorkers(): number {
  const raw = process.env.E2E_PARALLEL_WORKERS;
  if (raw === "0" || raw === "1") return 1;
  if (raw) {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.min(4, Math.floor(n)) : 2;
  }
  return 2;
}

/**
 * Total Next servers / DBs. When parallel workers ≤ 1, only w0 is used.
 * When parallelizing, w0 is SERIAL-only and SAFE uses w1..wN (PC-176).
 */
export function resolveServerCount(): number {
  const n = resolveParallelWorkers();
  return n <= 1 ? 1 : 1 + n;
}

/**
 * Maps a Playwright worker onto an isolated DB/port index.
 * SAFE workers skip 0 when parallelizing so they never race SERIAL resets on e2e-w0.
 */
export function dbIndexForProject(projectName: string, workerIndex: number): number {
  if (projectName !== "chromium-safe") return 0;
  const n = resolveParallelWorkers();
  if (n <= 1) return 0;
  return 1 + (((workerIndex % n) + n) % n);
}

/** Absolute Playwright testMatch regex for SAFE_PARALLEL project. */
export function safeParallelTestMatch(): RegExp {
  const escaped = SAFE_PARALLEL_SPECS.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`(${escaped.join("|")})$`);
}

/** Serial project: everything except SAFE_PARALLEL, mobile-only smoke, and auth setup. */
export function serialTestIgnore(): RegExp[] {
  return [
    safeParallelTestMatch(),
    /mobile-smoke\.spec\.ts$/,
    /auth\.setup\.ts$/,
  ];
}
