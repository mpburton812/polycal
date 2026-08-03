import {
  loadJiraCredentials,
  tryGetIssueStatus,
  transitionIssueToStatus,
} from "./lib/jira-api";

async function main() {
  const creds = loadJiraCredentials();
  if (!creds) {
    console.log("NO_CREDS");
    process.exit(1);
  }
  for (const key of [
    "PC-395",
    "PC-396",
    "PC-397",
    "PC-398",
    "PC-399",
    "PC-400",
    "PC-401",
    "PC-402",
  ]) {
    const s = await tryGetIssueStatus(creds, key);
    console.log(key, s?.name ?? "missing", s?.statusCategoryKey ?? "");
    if (s && s.statusCategoryKey !== "done") {
      try {
        await transitionIssueToStatus(creds, key, "Done");
        console.log(key, "-> Done");
      } catch (e) {
        console.log(key, "transition failed", e instanceof Error ? e.message : e);
      }
    }
  }
}

main();
