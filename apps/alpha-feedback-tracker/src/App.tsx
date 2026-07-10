import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  AppBar,
  Box,
  Button,
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
  STATUS_LABELS,
  getSubmission,
  listSubmissions,
  loginAdmin,
  notifySubmitter,
  patchSubmission,
  type FeedbackDetail,
  type FeedbackListItem,
  type FeedbackStatus,
} from "./api";

type SortKey = keyof FeedbackListItem;

const ENV_PRESETS = [
  { label: "Local", value: "http://localhost:3000" },
  {
    label: "Dev",
    value: "https://polycal-git-dev-michael-burton-s-projects.vercel.app",
  },
  {
    label: "Test",
    value: "https://polycal-git-test-michael-burton-s-projects.vercel.app",
  },
  { label: "Production", value: "https://polycal-ebon.vercel.app" },
];

const COLUMNS: { key: SortKey; label: string }[] = [
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

  const apiOptions = { protectionBypass };

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

  async function refresh(activeToken = token, activeBase = baseUrl) {
    if (!activeToken) return;
    setBusy(true);
    setError(null);
    try {
      const list = await listSubmissions(activeBase, activeToken, apiOptions);
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

  async function saveDetail() {
    if (!token || !detail) return;
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
      await refresh();
      const updated = await getSubmission(baseUrl, token, detail.id, apiOptions);
      setDetail(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleNotify() {
    if (!token || !detail) return;
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
      await notifySubmitter(
        baseUrl,
        token,
        detail.id,
        submitterComment,
        apiOptions,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notify failed");
    } finally {
      setBusy(false);
    }
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
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {baseUrl}
          </Typography>
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
                    <TableSortLabel
                      active={sortKey === column.key}
                      direction={sortKey === column.key ? sortDir : "asc"}
                      onClick={() => handleSort(column.key)}
                    >
                      {column.label}
                    </TableSortLabel>
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
                  <TableCell>{row.kind}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{STATUS_LABELS[row.status] ?? row.status}</TableCell>
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
                </TableRow>
              ))}
              {sortedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length}>
                    <Typography color="text.secondary">No submissions yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        fullWidth
        maxWidth="md"
      >
        {detail && (
          <>
            <DialogTitle>
              {detail.kind.toUpperCase()}: {detail.title}
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
                    component="img"
                    alt="Submission screenshot"
                    src={`data:${detail.screenshotMimeType ?? "image/jpeg"};base64,${detail.screenshotBase64}`}
                    sx={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain", border: 1, borderColor: "divider" }}
                  />
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
                  helperText="Included when notifying the submitter"
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetail(null)}>Close</Button>
              <Button disabled={busy} onClick={() => void saveDetail()}>
                Save
              </Button>
              <Button variant="contained" disabled={busy} onClick={() => void handleNotify()}>
                Notify submitter
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
