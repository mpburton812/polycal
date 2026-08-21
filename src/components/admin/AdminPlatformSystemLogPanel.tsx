"use client";

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import type { PlatformSystemLogEntry } from "@/actions/platform-log";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";

function weekday(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

/**
 * Platform-operator log directly under Network Administrator Log (PC-463).
 */
export function AdminPlatformSystemLogPanel({
  entries,
  compact = false,
}: {
  entries: PlatformSystemLogEntry[];
  compact?: boolean;
}) {
  return (
    <AdminCollapsibleSection title="Platform System Log">
      {entries.length === 0 ? (
        <Typography color="text.secondary">No platform events yet.</Typography>
      ) : (
        <Box sx={{ overflowX: "auto", maxHeight: compact ? 240 : 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Day</TableCell>
                <TableCell>Network</TableCell>
                <TableCell>Admin</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  sx={{
                    fontWeight: entry.emphasized ? 700 : 400,
                    bgcolor: entry.severity === "major" ? "#fff8e1" : undefined,
                  }}
                >
                  <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{weekday(entry.createdAt)}</TableCell>
                  <TableCell>{entry.networkName ?? "—"}</TableCell>
                  <TableCell>{entry.actorDisplayName ?? "—"}</TableCell>
                  <TableCell sx={{ fontWeight: entry.emphasized ? 700 : 400 }}>
                    {entry.summary}
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
