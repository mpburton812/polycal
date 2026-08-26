import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import {
  STATUS_COLORS,
  STATUS_LABELS,
  deleteSubmission,
  formatTicketId,
  getSubmission,
  listSubmissions,
  loginAdmin,
  notifySubmitter,
  patchSubmission,
  type FeedbackCommentLogEntry,
  type FeedbackDetail,
  type FeedbackListItem,
  type FeedbackStatus,
} from "./api";

type SortKey = keyof FeedbackListItem;

const ENV_PRESETS = [
  { label: "Local", value: "http://localhost:3000" },
  { label: "Dev", value: "https://dev.polycal.net" },
  { label: "Test", value: "https://test.polycal.net" },
  { label: "Production", value: "https://polycal.net" },
];

const COLUMNS: { key: SortKey | "actions"; label: string }[] = [
  { key: "ticketNumber", label: "ID" },
  { key: "kind", label: "Kind" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "submitterDisplayName", label: "Submitter" },
  { key: "environment", label: "Env" },
  { key: "buildSha", label: "SHA" },
  { key: "buildBranch", label: "Branch" },
  { key: "pagePath", label: "Page" },
  { key: "submittedAt", label: "Submitted" },
  { key: "osLabel", label: "OS" },
  { key: "viewportWidth", label: "Viewport" },
  { key: "actions", label: "Actions" },
];

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

/**
 * Alpha feedback triage UI — sortable grid + detail dialog (PC-122).
 */
export function App() {
  const [baseUrl, setBaseUrl] = useState(
    () => localStorage.getItem("afb_base") ?? ENV_PRESETS[0].value,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [protectionBypass, setProtectionBypass] = useState(
    () => localStorage.getItem("afb_bypass") ?? "",
  );
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("afb_token"),
  );
  const [adminName, setAdminName] = useState(
    () => localStorage.getItem("afb_admin") ?? "",
  );
  const [rows, setRows] = useState<FeedbackListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("submittedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [internalComment, setInternalComment] = useState("");
  const [submitterComment, setSubmitterComment] = useState("");
  const [status, setStatus] = useState<FeedbackStatus>("not_started");
  /** Active inbox vs archive list (PC-136). */
  const [listView, setListView] = useState<"active" | "archive">("active");
  /** Full-size screenshot lightbox (PC-182). */
  const [screenshotLightboxOpen, setScreenshotLightboxOpen] = useState(false);

  const apiOptions = { protectionBypass };

  const commentLogEntries = useMemo((): FeedbackCommentLogEntry[] => {
    const raw = detail?.commentLog;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [];
  }, [detail?.commentLog]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareValues(a[sortKey], b[sortKey]);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  async function handleLogin() {
    setBusy(true);
    setError(null);
    try {
      const result = await loginAdmin(baseUrl, username, password, apiOptions);
      setToken(result.token);
      setAdminName(result.displayName);
      localStorage.setItem("afb_token", result.token);
      localStorage.setItem("afb_admin", result.displayName);
      localStorage.setItem("afb_base", baseUrl);
      localStorage.setItem("afb_bypass", protectionBypass);
      await refresh(result.token, baseUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function refresh(activeToken = token, activeBase = baseUrl, view = listView) {
    if (!activeToken) return;
    setBusy(true);
    setError(null);
    try {
      const list = await listSubmissions(activeBase, activeToken, {
        ...apiOptions,
        archived: view === "archive",
      });
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      if (String(err).includes("401") || String(err).includes("Unauthorized")) {
        setToken(null);
        localStorage.removeItem("afb_token");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function openDetail(id: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    setScreenshotLightboxOpen(false);
    try {
      const submission = await getSubmission(baseUrl, token, id, apiOptions);
      setDetail(submission);
      setStatus(submission.status);
      setInternalComment(submission.internalComment ?? "");
      setSubmitterComment(submission.submitterComment ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load detail");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Persist status + comments: append non-empty drafts to the dated log, clear
   * fields, and email/notify the submitter when a submitter comment was saved (PC-183/184).
   */
  async function saveDetail() {
    if (!token || !detail) return;
    const submitterDraft = submitterComment.trim();
    const hadSubmitterComment = submitterDraft.length > 0;
    setBusy(true);
    setError(null);
    try {
      await patchSubmission(
        baseUrl,
        token,
        detail.id,
        {
          status,
          internalComment: internalComment || null,
          submitterComment: submitterComment || null,
        },
        apiOptions,
      );
      if (hadSubmitterComment) {
        await notifySubmitter(
          baseUrl,
          token,
          detail.id,
          submitterDraft,
          apiOptions,
        );
      }
      setInternalComment("");
      setSubmitterComment("");
      await refresh();
      const updated = await getSubmission(baseUrl, token, detail.id, apiOptions);
      setDetail(updated);
      setStatus(updated.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(archived: boolean) {
    if (!token || !detail) return;
    setBusy(true);
    setError(null);
    try {
      await patchSubmission(
        baseUrl,
        token,
        detail.id,
        { archived },
        apiOptions,
      );
      setDetail(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!token || !detail) return;
    const confirmed = window.confirm(
      `Permanently delete “${detail.title}”? This cannot be undone.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSubmission(baseUrl, token, detail.id, apiOptions);
      setDetail(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function switchListView(view: "active" | "archive") {
    setListView(view);
    setDetail(null);
    void refresh(token ?? undefined, baseUrl, view);
  }

  function logout() {
    setToken(null);
    setRows([]);
    setDetail(null);
    localStorage.removeItem("afb_token");
    localStorage.removeItem("afb_admin");
  }

  if (!token) {
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", mt: 8, p: 2 }}>
        <Typography variant="h5" gutterBottom>
          PolyCal Alpha Feedback Tracker
        </Typography>
        <Stack spacing={2}>
          <FormControl fullWidth>
            <InputLabel id="env-label">Environment</InputLabel>
            <Select
              labelId="env-label"
              label="Environment"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            >
              {ENV_PRESETS.map((preset) => (
                <MenuItem key={preset.value} value={preset.value}>
                  {preset.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Base URL"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            fullWidth
          />
          <TextField
            label="Admin username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            fullWidth
            autoComplete="username"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            fullWidth
            autoComplete="current-password"
          />
          <TextField
            label="Vercel protection bypass (Dev/Test)"
            type="password"
            value={protectionBypass}
            onChange={(event) => setProtectionBypass(event.target.value)}
            fullWidth
            helperText="Required for protected preview URLs. Vercel → Project → Settings → Deployment Protection → Protection Bypass for Automation."
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button variant="contained" disabled={busy} onClick={() => void handleLogin()}>
            Sign in
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Alpha Feedback — {adminName}
            {listView === "archive" ? " (Archive)" : ""}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {baseUrl}
          </Typography>
          {listView === "active" ? (
            <Button onClick={() => switchListView("archive")} disabled={busy}>
              Archive
            </Button>
          ) : (
            <Button onClick={() => switchListView("active")} disabled={busy}>
              Active inbox
            </Button>
          )}
          <Button startIcon={<RefreshIcon />} disabled={busy} onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button onClick={logout}>Log out</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {COLUMNS.map((column) => (
                  <TableCell key={column.key} sortDirection={sortKey === column.key ? sortDir : false}>
                    {column.key === "actions" ? (
                      column.label
                    ) : (
                      <TableSortLabel
                        active={sortKey === column.key}
                        direction={sortKey === column.key ? sortDir : "asc"}
                        onClick={() => handleSort(column.key as SortKey)}
                      >
                        {column.label}
                      </TableSortLabel>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => void openDetail(row.id)}
                >
                  <TableCell sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {formatTicketId(row.ticketNumber)}
                  </TableCell>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={STATUS_LABELS[row.status] ?? row.status}
                      color={STATUS_COLORS[row.status] ?? "default"}
                      variant={row.status === "not_started" ? "outlined" : "filled"}
                    />
                  </TableCell>
                  <TableCell>{row.submitterDisplayName}</TableCell>
                  <TableCell>{row.environment}</TableCell>
                  <TableCell>{row.buildSha?.slice(0, 7)}</TableCell>
                  <TableCell>{row.buildBranch}</TableCell>
                  <TableCell>{row.pagePath}</TableCell>
                  <TableCell>{new Date(row.submittedAt).toLocaleString()}</TableCell>
                  <TableCell>{row.osLabel}</TableCell>
                  <TableCell>
                    {row.viewportWidth && row.viewportHeight
                      ? `${row.viewportWidth}×${row.viewportHeight}`
                      : "—"}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Stack direction="row" spacing={0.5}>
                      {listView === "active" ? (
                        <Button
                          size="small"
                          disabled={busy || !token}
                          onClick={() => {
                            void (async () => {
                              if (!token) return;
                              setBusy(true);
                              try {
                                await patchSubmission(
                                  baseUrl,
                                  token,
                                  row.id,
                                  { archived: true },
                                  apiOptions,
                                );
                                await refresh();
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : "Archive failed",
                                );
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          Archive
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          disabled={busy || !token}
                          onClick={() => {
                            void (async () => {
                              if (!token) return;
                              setBusy(true);
                              try {
                                await patchSubmission(
                                  baseUrl,
                                  token,
                                  row.id,
                                  { archived: false },
                                  apiOptions,
                                );
                                await refresh();
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : "Restore failed",
                                );
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          Restore
                        </Button>
                      )}
                      <Button
                        size="small"
                        color="error"
                        disabled={busy || !token}
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Permanently delete “${row.title}”? This cannot be undone.`,
                          );
                          if (!confirmed || !token) return;
                          void (async () => {
                            setBusy(true);
                            try {
                              await deleteSubmission(baseUrl, token, row.id, apiOptions);
                              await refresh();
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : "Delete failed",
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {sortedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length}>
                    <Typography color="text.secondary">
                      {listView === "archive"
                        ? "No archived submissions."
                        : "No submissions yet."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Dialog
        open={Boolean(detail)}
        onClose={() => {
          setScreenshotLightboxOpen(false);
          setDetail(null);
        }}
        fullWidth
        maxWidth="md"
      >
        {detail && (
          <>
            <DialogTitle>
              {formatTicketId(detail.ticketNumber)} · {detail.kind.toUpperCase()}:{" "}
              {detail.title}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  {detail.submitterDisplayName} · {detail.environment} ·{" "}
                  {detail.buildSha?.slice(0, 7)} · {detail.pagePath} ·{" "}
                  {detail.osLabel} ·{" "}
                  {detail.viewportWidth && detail.viewportHeight
                    ? `${detail.viewportWidth}×${detail.viewportHeight}`
                    : "viewport n/a"}
                </Typography>
                <Typography whiteSpace="pre-wrap">{detail.description}</Typography>
                {detail.consoleLogTail && (
                  <Box
                    component="pre"
                    sx={{
                      p: 1.5,
                      bgcolor: "#1a1a1a",
                      color: "#e0e0e0",
                      borderRadius: 1,
                      overflow: "auto",
                      fontSize: 12,
                    }}
                  >
                    {(() => {
                      try {
                        const lines = JSON.parse(detail.consoleLogTail) as string[];
                        return lines.join("\n");
                      } catch {
                        return detail.consoleLogTail;
                      }
                    })()}
                  </Box>
                )}
                {detail.screenshotBase64 && (
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setScreenshotLightboxOpen(true)}
                    aria-label="View screenshot full size"
                    sx={{
                      display: "block",
                      p: 0,
                      m: 0,
                      border: 1,
                      borderColor: "divider",
                      bgcolor: "transparent",
                      cursor: "zoom-in",
                      maxWidth: "100%",
                      textAlign: "left",
                    }}
                  >
                    <Box
                      component="img"
                      alt="Submission screenshot"
                      src={`data:${detail.screenshotMimeType ?? "image/jpeg"};base64,${detail.screenshotBase64}`}
                      sx={{
                        display: "block",
                        maxWidth: "100%",
                        maxHeight: 360,
                        objectFit: "contain",
                      }}
                    />
                  </Box>
                )}
                <FormControl fullWidth>
                  <InputLabel id="status-label">Status</InputLabel>
                  <Select
                    labelId="status-label"
                    label="Status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
                  >
                    {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((key) => (
                      <MenuItem key={key} value={key}>
                        {STATUS_LABELS[key]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Internal comment"
                  value={internalComment}
                  onChange={(event) => setInternalComment(event.target.value)}
                  multiline
                  minRows={2}
                  fullWidth
                />
                <TextField
                  label="Submitter comment"
                  value={submitterComment}
                  onChange={(event) => setSubmitterComment(event.target.value)}
                  multiline
                  minRows={2}
                  fullWidth
                  helperText="Saving with a submitter comment notifies the submitter"
                />
                {commentLogEntries.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Comment log
                    </Typography>
                    <Stack spacing={1.5}>
                      {[...commentLogEntries].reverse().map((entry, index) => (
                        <Box
                          key={`${entry.at}-${index}`}
                          sx={{
                            p: 1.5,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {new Date(entry.at).toLocaleString()}
                          </Typography>
                          {entry.internalComment ? (
                            <Typography
                              variant="body2"
                              sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}
                            >
                              <strong>Internal:</strong> {entry.internalComment}
                            </Typography>
                          ) : null}
                          {entry.submitterComment ? (
                            <Typography
                              variant="body2"
                              sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}
                            >
                              <strong>Submitter:</strong> {entry.submitterComment}
                            </Typography>
                          ) : null}
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button
                color="error"
                disabled={busy}
                onClick={() => void handleDelete()}
                sx={{ mr: "auto" }}
              >
                Delete
              </Button>
              {listView === "archive" ? (
                <Button disabled={busy} onClick={() => void handleArchive(false)}>
                  Restore
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => void handleArchive(true)}>
                  Archive
                </Button>
              )}
              <Button
                onClick={() => {
                  setScreenshotLightboxOpen(false);
                  setDetail(null);
                }}
              >
                Close
              </Button>
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => void saveDetail()}
              >
                Save
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog
        open={Boolean(detail?.screenshotBase64) && screenshotLightboxOpen}
        onClose={() => setScreenshotLightboxOpen(false)}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: {
            m: 1,
            maxWidth: "min(96vw, 1400px)",
            bgcolor: "#111",
          },
        }}
      >
        <DialogTitle sx={{ color: "#fff", py: 1 }}>
          Screenshot
          <Button
            onClick={() => setScreenshotLightboxOpen(false)}
            sx={{ float: "right", color: "#fff" }}
          >
            Close
          </Button>
        </DialogTitle>
        <DialogContent sx={{ p: 1, display: "flex", justifyContent: "center" }}>
          {detail?.screenshotBase64 ? (
            <Box
              component="img"
              alt="Submission screenshot full size"
              src={`data:${detail.screenshotMimeType ?? "image/jpeg"};base64,${detail.screenshotBase64}`}
              sx={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
