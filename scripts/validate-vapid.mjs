#!/usr/bin/env node
/**
 * Validate Web Push (VAPID) configuration for local or Vercel runtime.
 *
 * Usage:
 *   node scripts/validate-vapid.mjs
 *   npx vercel env run -e preview --git-branch test -- node scripts/validate-vapid.mjs
 */
import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return {};
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

function mergeEnv() {
  const local = loadEnvLocal();
  return {
    VAPID_PUBLIC_KEY:
      process.env.VAPID_PUBLIC_KEY ?? local.VAPID_PUBLIC_KEY ?? "",
    VAPID_PRIVATE_KEY:
      process.env.VAPID_PRIVATE_KEY ?? local.VAPID_PRIVATE_KEY ?? "",
    VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? local.VAPID_SUBJECT ?? "",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY:
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
      local.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
      "",
  };
}

function status(ok) {
  return ok ? "PASS" : "FAIL";
}

const env = mergeEnv();
const publicKey = env.VAPID_PUBLIC_KEY.trim();
const privateKey = env.VAPID_PRIVATE_KEY.trim();
const subject = env.VAPID_SUBJECT.trim();
const clientKey = (env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || publicKey).trim();

console.log("=== VAPID configuration ===");
console.log(`${status(Boolean(publicKey))} VAPID_PUBLIC_KEY (${publicKey.length} chars)`);
console.log(`${status(Boolean(privateKey))} VAPID_PRIVATE_KEY (${privateKey.length} chars)`);
console.log(`${status(Boolean(subject))} VAPID_SUBJECT (${subject || "missing"})`);
console.log(
  `${status(Boolean(clientKey))} NEXT_PUBLIC_VAPID_PUBLIC_KEY / client key (${clientKey.length} chars)`,
);

const keysMatch = !publicKey || !clientKey || publicKey === clientKey;
console.log(`${status(keysMatch)} Public keys match (server vs client)`);

let webPushOk = false;
if (publicKey && privateKey && subject) {
  try {
    const imported = await import("web-push");
    const webpush = imported.default ?? imported;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    webPushOk = true;
    console.log(`${status(true)} web-push setVapidDetails accepted key pair`);
  } catch (error) {
    console.log(`${status(false)} web-push setVapidDetails: ${error.message}`);
  }
} else {
  console.log(`${status(false)} web-push setVapidDetails (missing vars)`);
}

const allOk = Boolean(
  publicKey && privateKey && subject && clientKey && keysMatch && webPushOk,
);
console.log(allOk ? "\nVAPID ready for Web Push." : "\nVAPID not fully configured.");
process.exit(allOk ? 0 : 1);
