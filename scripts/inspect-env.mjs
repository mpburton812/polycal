import { readFileSync } from "node:fs";

const file = process.argv[2] ?? ".env.local";
const lines = readFileSync(file, "utf8").split(/\r?\n/);
for (const key of [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "NEXT_PUBLIC_APP_ENV",
  "AUTH_SECRET",
  "AUTH_URL",
]) {
  const line = lines.find((entry) => entry.startsWith(`${key}=`));
  if (!line) {
    console.log(`${key}: missing`);
    continue;
  }
  let value = line.slice(key.length + 1);
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  if (key.includes("TOKEN") || key.includes("SECRET")) {
    console.log(`${key}: set (len ${value.length})`);
  } else if (key === "TURSO_DATABASE_URL") {
    console.log(`${key}: ${value.replace(/libsql:\/\/[^@]+@/, "libsql://***@")}`);
  } else {
    console.log(`${key}: ${value || "(empty)"}`);
  }
}
