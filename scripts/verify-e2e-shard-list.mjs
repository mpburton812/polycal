/** Verify suite-scoped Playwright shard test counts (local --list). */
import { execSync } from "node:child_process";

const jobs = [
  {
    label: "serial 1/3",
    args: "--project=chromium-serial --shard=1/3",
    env: { E2E_PARALLEL_WORKERS: "1", E2E_INCLUDE_MOBILE: "0" },
  },
  {
    label: "serial 2/3",
    args: "--project=chromium-serial --shard=2/3",
    env: { E2E_PARALLEL_WORKERS: "1", E2E_INCLUDE_MOBILE: "0" },
  },
  {
    label: "serial 3/3",
    args: "--project=chromium-serial --shard=3/3",
    env: { E2E_PARALLEL_WORKERS: "1", E2E_INCLUDE_MOBILE: "0" },
  },
  {
    label: "safe 1/2",
    args: "--project=chromium-safe --project=mobile-chrome --shard=1/2",
    env: { E2E_PARALLEL_WORKERS: "2", E2E_INCLUDE_MOBILE: "1" },
  },
  {
    label: "safe 2/2",
    args: "--project=chromium-safe --project=mobile-chrome --shard=2/2",
    env: { E2E_PARALLEL_WORKERS: "2", E2E_INCLUDE_MOBILE: "1" },
  },
];

for (const job of jobs) {
  const out = execSync(`npx playwright test --list ${job.args} --reporter=line`, {
    encoding: "utf8",
    maxBuffer: 10e6,
    env: { ...process.env, ...job.env },
  });
  const serial = (out.match(/\[chromium-serial\]/g) || []).length;
  const safe = (out.match(/\[chromium-safe\]/g) || []).length;
  const mobile = (out.match(/\[mobile-chrome\]/g) || []).length;
  const setup = (out.match(/\[setup\]/g) || []).length;
  const total = out.match(/Total: (\d+) tests/);
  console.log(
    `${job.label}: total=${total?.[1] ?? "?"} setup=${setup} serial=${serial} safe=${safe} mobile=${mobile}`,
  );
}
