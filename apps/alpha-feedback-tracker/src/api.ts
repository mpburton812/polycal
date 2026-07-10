export type FeedbackStatus =
  | "not_started"
  | "in_progress"
  | "deferred"
  | "working_as_designed"
  | "closed";

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  deferred: "Deferred",
  working_as_designed: "Working As Designed",
  closed: "Closed",
};

export interface FeedbackListItem {
  id: string;
  kind: "bug" | "feature";
  title: string;
  description: string;
  status: FeedbackStatus;
  submitterUserId: string;
  submitterDisplayName: string;
  submittedAt: string;
  environment: string | null;
  buildSha: string | null;
  buildBranch: string | null;
  pagePath: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  userAgent: string | null;
  osLabel: string | null;
  consoleLogTail: string | null;
  hasScreenshot: boolean;
  screenshotMimeType: string | null;
  internalComment: string | null;
  submitterComment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackDetail extends FeedbackListItem {
  screenshotBase64: string | null;
  statusLabel?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function apiFetch<T>(
  baseUrl: string,
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

export async function loginAdmin(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ token: string; displayName: string }> {
  const data = await apiFetch<{
    token: string;
    user: { displayName: string };
  }>(baseUrl, "/api/admin/alpha-feedback/login", null, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return { token: data.token, displayName: data.user.displayName };
}

export async function listSubmissions(
  baseUrl: string,
  token: string,
): Promise<FeedbackListItem[]> {
  const data = await apiFetch<{ submissions: FeedbackListItem[] }>(
    baseUrl,
    "/api/admin/alpha-feedback",
    token,
  );
  return data.submissions;
}

export async function getSubmission(
  baseUrl: string,
  token: string,
  id: string,
): Promise<FeedbackDetail> {
  const data = await apiFetch<{ submission: FeedbackDetail }>(
    baseUrl,
    `/api/admin/alpha-feedback/${encodeURIComponent(id)}`,
    token,
  );
  return data.submission;
}

export async function patchSubmission(
  baseUrl: string,
  token: string,
  id: string,
  body: {
    status?: FeedbackStatus;
    internalComment?: string | null;
    submitterComment?: string | null;
  },
): Promise<void> {
  await apiFetch(baseUrl, `/api/admin/alpha-feedback/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function notifySubmitter(
  baseUrl: string,
  token: string,
  id: string,
  submitterComment?: string,
): Promise<void> {
  await apiFetch(
    baseUrl,
    `/api/admin/alpha-feedback/${encodeURIComponent(id)}/notify`,
    token,
    {
      method: "POST",
      body: JSON.stringify(
        submitterComment !== undefined ? { submitterComment } : {},
      ),
    },
  );
}
