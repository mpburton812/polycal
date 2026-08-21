"use client";

import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useTransition, type MouseEvent } from "react";

import type { ActivityLogEntry } from "@/actions/admin";
import { exportActivityLogAction } from "@/actions/admin";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { formatActivityLogAction, formatActivityLogDetails } from "@/lib/audit/activity-log-display";

function eventColor(eventType: string): string {
  if (eventType === "error") return "#ffcdd2";
  if (eventType === "system") return "#fafafa";
  return "#e3f2fd";
}

/**
 * Network Administrator Log viewer with export (PC-32 / PC-463).
 */
export function AdminActivityLogPanel({ entries }: { entries: ActivityLogEntry[] }) {
  const [pending, startTransition] = useTransition();

  function handleExport(event: MouseEvent) {
    event.stopPropagation();
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

  return (
    <AdminCollapsibleSection
        title="Network Administrator Log"
      headerAction={
        entries.length > 0 ? (
          <Button
            variant="outlined"
            size="small"
            onClick={handleExport}
            disabled={pending}
          >
            Export CSV
          </Button>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <Typography color="text.secondary">
          No log entries to display. Increase log tail length in network settings.
        </Typography>
      ) : (
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
                  <TableCell>{formatActivityLogAction(entry.action)}</TableCell>
                  <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {formatActivityLogDetails(entry.action, entry.details ?? null)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </AdminCollapsibleSection>
  );
}
