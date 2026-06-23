import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Project workflow settings loaded from .workflow.json at repo root. */
export interface WorkflowConfig {
  projectName: string;
  jiraProjectKey: string;
  jiraBaseUrl: string;
}

const DEFAULT_CONFIG: WorkflowConfig = {
  projectName: "project",
  jiraProjectKey: "PROJ",
  jiraBaseUrl: "https://your-org.atlassian.net",
};

let cachedConfig: WorkflowConfig | null = null;

/** Load and cache `.workflow.json` from the repository root. */
export function getWorkflowConfig(): WorkflowConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = join(process.cwd(), ".workflow.json");
  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  cachedConfig = {
    ...DEFAULT_CONFIG,
    ...JSON.parse(readFileSync(configPath, "utf8")) as Partial<WorkflowConfig>,
  };

  return cachedConfig;
}

/** Regex matching Jira issue keys for the configured project (e.g. PROJ-123). */
export function getJiraKeyPattern(): RegExp {
  const key = getWorkflowConfig().jiraProjectKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${key}-\\d+`, "g");
}

/** Human-readable Jira key placeholder for CLI messages (e.g. PROJ-xxx). */
export function jiraKeyLabel(): string {
  return `${getWorkflowConfig().jiraProjectKey}-xxx`;
}

/** Example Jira key for error messages (e.g. PROJ-42). */
export function jiraKeyExample(module = "scope"): string {
  return `${getWorkflowConfig().jiraProjectKey}-42`;
}
