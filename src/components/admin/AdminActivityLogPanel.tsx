"use client";

import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useTransition } from "react";

import type { ActivityLogEntry } from "@/actions/admin";
import { exportActivityLogAction } from "@/actions/admin";

function eventColor(eventType: string): string {
  if (eventType === "error") return "#ffcdd2";
  if (eventType === "system") return "#fafafa";
  return "#e3f2fd";
}

/**
 * System administrator log viewer with export (PC-32).
 */
export function AdminActivityLogPanel({ entries }: { entries: ActivityLogEntry[] }) {
  const [pending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportActivityLogAction();
      if (!result.ok || !result.csv) return;
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `polycal-activity-log-${Date.now()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  if (entries.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          System administrator log
        </Typography>
        <Typography color="text.secondary">
          No log entries to display. Increase log tail length in poly group settings.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">System administrator log</Typography>
        <Button variant="outlined" size="small" onClick={handleExport} disabled={pending}>
          Export CSV
        </Button>
      </Stack>
      <Box sx={{ overflowX: "auto", maxHeight: 400 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id} sx={{ bgcolor: eventColor(entry.eventType) }}>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>{entry.eventType}</TableCell>
                <TableCell>{entry.userDisplayName ?? "—"}</TableCell>
                <TableCell>{entry.action}</TableCell>
                <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.details ?? ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
