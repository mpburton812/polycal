"use client";

import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";

import type { PlatformNetworkDetailReport } from "@/actions/platform-admin";
import { getNetworkDetailReportAction } from "@/actions/platform-admin";
import { brutalPaperSx } from "@/theme/brutalUi";

interface NetworkDetailDialogProps {
  networkId: string | null;
  networkName: string;
  onClose: () => void;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ py: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", fontWeight: 600, mb: 0.25 }}
      >
        {label}
      </Typography>
      <Box sx={{ typography: "body2" }}>{children}</Box>
    </Box>
  );
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
    <Dialog open={Boolean(networkId)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Network detail — {networkName}</DialogTitle>
      <DialogContent>
        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        {!report && !error && <Typography variant="body2">Loading report…</Typography>}
        {report && (
          <Stack spacing={2}>
            <Paper sx={{ ...brutalPaperSx, p: 2 }}>
              <DetailRow label="Network status">{report.networkStatus}</DetailRow>
              <Divider />
              <DetailRow label="Member count">{report.memberCount}</DetailRow>
              <Divider />
              <DetailRow label="Calendar events">{report.calendarEventCount}</DetailRow>
              <Divider />
              <DetailRow label="Kanban counts">
                <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ pt: 0.25 }}>
                  <Chip label={`Draft: ${report.kanbanCounts.draft}`} size="small" />
                  <Chip label={`Proposed: ${report.kanbanCounts.proposed}`} size="small" />
                  <Chip label={`Resolved: ${report.kanbanCounts.resolved}`} size="small" />
                  <Chip label={`Archived: ${report.kanbanCounts.archived}`} size="small" />
                </Stack>
              </DetailRow>
            </Paper>

            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Members &amp; access
              </Typography>
              <Stack spacing={1.5}>
                {report.members.map((member) => (
                  <Paper key={member.userId} sx={{ ...brutalPaperSx, p: 2 }}>
                    <DetailRow label="Username">{member.username}</DetailRow>
                    <Divider />
                    <DetailRow label="Profile name">{member.displayName}</DetailRow>
                    <Divider />
                    <DetailRow label="Network role">{member.networkRole}</DetailRow>
                    <Divider />
                    <DetailRow label="Account role">{member.userRole}</DetailRow>
                  </Paper>
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Daily logins (last 14 days)
              </Typography>
              {report.dailyLogins.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No logins recorded in this period.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {report.dailyLogins.map((row) => (
                    <Paper key={row.date} sx={{ ...brutalPaperSx, p: 1.5 }}>
                      <DetailRow label={row.date}>{row.count} logins</DetailRow>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
