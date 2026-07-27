"use client";

import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

import type { PlatformNetworkDetailReport } from "@/actions/platform-admin";
import { getNetworkDetailReportAction } from "@/actions/platform-admin";

interface NetworkDetailDialogProps {
  networkId: string | null;
  networkName: string;
  onClose: () => void;
}

/**
 * Platform operator report for a single network (PC-362).
 */
export function NetworkDetailDialog({
  networkId,
  networkName,
  onClose,
}: NetworkDetailDialogProps) {
  const [report, setReport] = useState<PlatformNetworkDetailReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!networkId) {
      setReport(null);
      return;
    }
    void getNetworkDetailReportAction(networkId).then((result) => {
      if (result.ok) {
        setReport(result.report);
        setError(null);
      } else {
        setReport(null);
        setError(result.message);
      }
    });
  }, [networkId]);

  return (
    <Dialog open={Boolean(networkId)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Network detail — {networkName}</DialogTitle>
      <DialogContent>
        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        {!report && !error && <Typography variant="body2">Loading report…</Typography>}
        {report && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              <Chip label={`Status: ${report.networkStatus}`} size="small" />
              <Chip label={`Members: ${report.memberCount}`} size="small" />
              <Chip label={`Calendar events: ${report.calendarEventCount}`} size="small" />
              <Chip label={`Draft: ${report.kanbanCounts.draft}`} size="small" />
              <Chip label={`Proposed: ${report.kanbanCounts.proposed}`} size="small" />
              <Chip label={`Resolved: ${report.kanbanCounts.resolved}`} size="small" />
              <Chip label={`Archived: ${report.kanbanCounts.archived}`} size="small" />
            </Box>

            <Typography variant="subtitle2">Members &amp; access</Typography>
            <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
              <TableHead>
                <TableRow>
                  <TableCell>Username</TableCell>
                  <TableCell>Profile</TableCell>
                  <TableCell>Network role</TableCell>
                  <TableCell>Account</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell sx={{ wordBreak: "break-word" }}>{member.username}</TableCell>
                    <TableCell sx={{ wordBreak: "break-word" }}>{member.displayName}</TableCell>
                    <TableCell>{member.networkRole}</TableCell>
                    <TableCell>{member.userRole}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="subtitle2">Daily logins (last 14 days)</Typography>
            {report.dailyLogins.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No logins recorded in this period.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Logins</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.dailyLogins.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
