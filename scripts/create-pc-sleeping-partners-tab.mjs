/**
 * Creates PC task: rename MAP tab to Sleeping Partners.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  const text = fs.readFileSync(file, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    env[line.slice(0, i)] = line.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...process.env, ...loadEnvLocal() };
const baseUrl = env.JIRA_BASE_URL?.replace(/\/$/, "");
const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");

const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    fields: {
      project: { key: "PC" },
      summary: "Rename People & Places MAP tab to Sleeping Partners",
      issuetype: { name: "Task" },
      parent: { key: "PC-177" },
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Rename the MAP tab label under People & Places to Sleeping Partners.",
              },
            ],
          },
        ],
      },
    },
  }),
});
const text = await res.text();
if (!res.ok) throw new Error(`${res.status} ${text}`);
console.log(JSON.parse(text).key);
