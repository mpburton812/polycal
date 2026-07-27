"use client";

import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { brutalPaperSx } from "@/theme/brutalUi";

export type NetworkDashboardData = {
  networkId: string;
  name: string;
  status: string;
  memberCount: number;
  createdAt: string;
  createdByEmail: string | null;
  allowUserProvisioning: boolean;
  role: string;
};

/**
 * Active-network summary for network admins (PC-363).
 */
export function AdminNetworkDashboardPanel({
  dashboard,
}: {
  dashboard: NetworkDashboardData;
}) {
  return (
    <AdminCollapsibleSection title="Network">
      <Paper sx={{ ...brutalPaperSx, p: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h6" component="h2">
              {dashboard.name}
            </Typography>
            <Chip
              size="small"
              label={dashboard.status}
              color={dashboard.status === "active" ? "success" : "warning"}
              variant="outlined"
            />
            <Chip size="small" label={`Your role: ${dashboard.role}`} variant="outlined" />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {dashboard.memberCount} active member{dashboard.memberCount === 1 ? "" : "s"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Created {dashboard.createdAt.slice(0, 10)}
            {dashboard.createdByEmail ? ` · ${dashboard.createdByEmail}` : ""}
          </Typography>
          <Typography variant="body2">
            Member provisioning:{" "}
            {dashboard.allowUserProvisioning ? "enabled" : "disabled"}
          </Typography>
          <Box sx={{ pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Network ID: {dashboard.networkId}
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </AdminCollapsibleSection>
  );
}
