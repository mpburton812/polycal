export type FeedbackStatus =
  | "not_started"
  | "in_progress"
  | "ready_for_testing"
  | "deferred"
  | "working_as_designed"
  | "closed";

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  ready_for_testing: "Ready For Testing",
  deferred: "Deferred",
  working_as_designed: "Working As Designed",
  closed: "Closed",
};

/** MUI Chip color mapping for triage statuses (PC-221). */
export const STATUS_COLORS: Record<
  FeedbackStatus,
  "default" | "info" | "warning" | "success" | "error" | "secondary"
> = {
  not_started: "default",
  in_progress: "info",
  ready_for_testing: "success",
  deferred: "warning",
  working_as_designed: "secondary",
  closed: "error",
};

export interface FeedbackCommentLogEntry {
  at: string;
  internalComment?: string;
  submitterComment?: string;
}

export interface FeedbackListItem {
  id: string;
  /** Stable human-visible ticket number; displayed as #N (PC-222). */
  ticketNumber: number | null;
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
  commentLog?: FeedbackCommentLogEntry[] | string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackDetail extends FeedbackListItem {
  screenshotBase64: string | null;
  statusLabel?: string;
  commentLog?: FeedbackCommentLogEntry[];
}

export interface ApiClientOptions {
  /** Optional Vercel Deployment Protection bypass secret for preview envs. */
  protectionBypass?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** In Vite/Tauri webview, proxy remote hosts to avoid CORS + Vercel SSO preflight. */
function shouldUseDevProxy(baseUrl: string): boolean {
  if (typeof window === "undefined") return false;
  if (!import.meta.env.DEV) return false;
  try {
    const target = new URL(baseUrl);
    const here = window.location.hostname;
    return target.hostname !== here && target.hostname !== "localhost" && target.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

function resolveFetchUrl(baseUrl: string, path: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (shouldUseDevProxy(normalized)) {
    return `/__polycal${path.startsWith("/") ? path : `/${path}`}`;
  }
  return `${normalized}${path.startsWith("/") ? path : `/${path}`}`;
}

function explainFailure(status: number, data: unknown, networkError?: unknown): Error {
  if (networkError) {
    return new Error(
      "Could not reach PolyCal. For Local, run `npm run dev` in the PolyCal repo. For Dev/Test, Vercel Deployment Protection may be blocking — add a Protection Bypass secret.",
    );
  }

  const record = data as {
    error?: string | { message?: string; code?: string };
    protection?: unknown;
  };

  if (status === 307 || status === 308) {
    return new Error(
      "Vercel returned a redirect (307). Restart the tracker (`npm run dev`) so the updated proxy can follow protection-bypass redirects.",
    );
  }

  if (
    status === 401 &&
    (record.protection ||
      (typeof record.error === "object" && record.error?.message === "Protected deployment"))
  ) {
    return new Error(
      "Vercel Deployment Protection blocked this request. Paste a Protection Bypass secret (Project Settings → Deployment Protection), or use Local.",
    );
  }

  if (typeof record.error === "string") return new Error(record.error);
  if (typeof record.error === "object" && record.error?.message) {
    return new Error(record.error.message);
  }
  return new Error(`Request failed (${status})`);
}

async function apiFetch<T>(
  baseUrl: string,
  path: string,
  token: string | null,
  init?: RequestInit,
  options?: ApiClientOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (shouldUseDevProxy(baseUrl)) {
    headers["x-polycal-target"] = normalizeBaseUrl(baseUrl);
  }
  if (options?.protectionBypass?.trim()) {
    headers["x-vercel-protection-bypass"] = options.protectionBypass.trim();
  }

  let response: Response;
  try {
    response = await fetch(resolveFetchUrl(baseUrl, path), {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (error) {
    throw explainFailure(0, null, error);
  }

  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw explainFailure(response.status, data);
  }
  return data;
}

export async function loginAdmin(
  baseUrl: string,
  username: string,
  password: string,
  options?: ApiClientOptions,
): Promise<{ token: string; displayName: string }> {
  const data = await apiFetch<{
    token: string;
    user: { displayName: string };
  }>(
    baseUrl,
    "/api/admin/alpha-feedback/login",
    null,
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    },
    options,
  );
  return { token: data.token, displayName: data.user.displayName };
}

export async function listSubmissions(
  baseUrl: string,
  token: string,
  options?: ApiClientOptions & { archived?: boolean },
): Promise<FeedbackListItem[]> {
  const query = options?.archived ? "?archived=1" : "";
  const data = await apiFetch<{ submissions: FeedbackListItem[] }>(
    baseUrl,
    `/api/admin/alpha-feedback${query}`,
    token,
    undefined,
    options,
  );
  return data.submissions;
}

export async function getSubmission(
  baseUrl: string,
  token: string,
  id: string,
  options?: ApiClientOptions,
): Promise<FeedbackDetail> {
  const data = await apiFetch<{ submission: FeedbackDetail }>(
    baseUrl,
    `/api/admin/alpha-feedback/${encodeURIComponent(id)}`,
    token,
    undefined,
    options,
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
    archived?: boolean;
  },
  options?: ApiClientOptions,
): Promise<void> {
  await apiFetch(
    baseUrl,
    `/api/admin/alpha-feedback/${encodeURIComponent(id)}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    options,
  );
}

/** Permanently deletes a submission (PC-135). */
export async function deleteSubmission(
  baseUrl: string,
  token: string,
  id: string,
  options?: ApiClientOptions,
): Promise<void> {
  await apiFetch(
    baseUrl,
    `/api/admin/alpha-feedback/${encodeURIComponent(id)}`,
    token,
    { method: "DELETE" },
    options,
  );
}

export async function notifySubmitter(
  baseUrl: string,
  token: string,
  id: string,
  submitterComment?: string,
  options?: ApiClientOptions,
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
    options,
  );
}

/** Formats a durable ticket number for display (PC-222). */
export function formatTicketId(ticketNumber: number | null | undefined): string {
  if (ticketNumber == null || !Number.isFinite(ticketNumber)) return "—";
  return `#${ticketNumber}`;
}
