"use client";

import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import {
  clearNetworkMotdAction,
  clearPlatformMotdAction,
  publishNetworkMotdAction,
  publishPlatformMotdAction,
} from "@/actions/motd";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { MotdAdminForm } from "@/components/motd/MotdAdminForm";
import type { MotdAdminState } from "@/lib/motd/types";
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
 * Active-network summary for network admins (PC-363) + MOTD (PC-392 / PC-406).
 * Platform admins get an All Platform toggle on the shared MOTD form.
 */
export function AdminNetworkDashboardPanel({
  dashboard,
  initialMotd = null,
  isPlatformAdmin = false,
  initialPlatformMotd = null,
}: {
  dashboard: NetworkDashboardData;
  initialMotd?: MotdAdminState | null;
  isPlatformAdmin?: boolean;
  initialPlatformMotd?: MotdAdminState | null;
}) {
  return (
    <AdminCollapsibleSection title="Network Summary & MOTD">
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
          <Box sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
            <MotdAdminForm
              scopeLabel="Network"
              initial={initialMotd}
              publishAction={publishNetworkMotdAction}
              clearAction={clearNetworkMotdAction}
              allowAllPlatformToggle={isPlatformAdmin}
              publishPlatformAction={publishPlatformMotdAction}
              clearPlatformAction={clearPlatformMotdAction}
              initialPlatform={initialPlatformMotd}
            />
          </Box>
        </Stack>
      </Paper>
    </AdminCollapsibleSection>
  );
}
