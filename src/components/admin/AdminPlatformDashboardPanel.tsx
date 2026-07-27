"use client";

import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";

import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import type {
  PlatformDashboardData,
  PlatformNetworkNode,
} from "@/actions/networks";
import { brutalPaperSx } from "@/theme/brutalUi";
import type { PlatformSettings } from "@/types/network";

/**
 * Platform operator dashboard: network nodes, aggregate stats, and controls (PC-365).
 */
export function AdminPlatformDashboardPanel({
  initialDashboard,
  setNetworkStatusAction,
  updatePlatformSettingsAction,
  embedded = true,
}: {
  initialDashboard: PlatformDashboardData;
  setNetworkStatusAction: (
    networkId: string,
    status: "active" | "paused",
  ) => Promise<{ ok: boolean; message: string }>;
  updatePlatformSettingsAction: (input: {
    maxNetworksPerEmail: number;
    maxNetworkCreatesPerDay: number;
  }) => Promise<{ ok: boolean; message: string }>;
  /** When false, renders a page title (used by /platform-admin). */
  embedded?: boolean;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [maxPerEmail, setMaxPerEmail] = useState(
    initialDashboard.settings.maxNetworksPerEmail,
  );
  const [maxPerDay, setMaxPerDay] = useState(
    initialDashboard.settings.maxNetworkCreatesPerDay,
  );
  const [message, setMessage] = useState<string | null>(null);

  const { summary, networks } = dashboard;

  async function saveSettings() {
    const result = await updatePlatformSettingsAction({
      maxNetworksPerEmail: maxPerEmail,
      maxNetworkCreatesPerDay: maxPerDay,
    });
    setMessage(result.message);
    if (result.ok) {
      setDashboard((prev) => ({
        ...prev,
        settings: {
          maxNetworksPerEmail: maxPerEmail,
          maxNetworkCreatesPerDay: maxPerDay,
        },
      }));
    }
  }

  async function toggleStatus(node: PlatformNetworkNode) {
    const next = node.status === "active" ? "paused" : "active";
    const result = await setNetworkStatusAction(node.id, next);
    setMessage(result.message);
    if (result.ok) {
      setDashboard((prev) => {
        const nextNetworks = prev.networks.map((n) =>
          n.id === node.id ? { ...n, status: next } : n,
        );
        const activeNetworks = nextNetworks.filter((n) => n.status === "active").length;
        const pausedNetworks = nextNetworks.filter((n) => n.status === "paused").length;
        return {
          ...prev,
          summary: { ...prev.summary, activeNetworks, pausedNetworks },
          networks: nextNetworks,
        };
      });
    }
  }

  const content = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {message && <Typography variant="body2">{message}</Typography>}

      <Paper sx={{ ...brutalPaperSx, p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
          Platform overview
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`${summary.totalNetworks} networks`} variant="outlined" />
          <Chip
            label={`${summary.activeNetworks} active`}
            color="success"
            variant="outlined"
          />
          <Chip
            label={`${summary.pausedNetworks} paused`}
            color={summary.pausedNetworks > 0 ? "warning" : "default"}
            variant="outlined"
          />
          <Chip
            label={`${summary.distinctMembers} distinct members`}
            variant="outlined"
          />
          <Chip
            label={`${summary.totalMemberSeats} membership seats`}
            variant="outlined"
          />
          <Chip
            label={`${summary.networksCreatedToday} created today`}
            color={
              summary.networksCreatedToday >= dashboard.settings.maxNetworkCreatesPerDay
                ? "warning"
                : "default"
            }
            variant="outlined"
          />
        </Stack>
      </Paper>

      <Paper sx={{ ...brutalPaperSx, p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Creation caps
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Limits self-serve network creation via magic links at /create-network.
        </Typography>
        <TextField
          label="Max networks per email"
          type="number"
          size="small"
          value={maxPerEmail}
          onChange={(e) => setMaxPerEmail(Number(e.target.value))}
          sx={{ mr: 2, mb: 1, minWidth: 200 }}
        />
        <TextField
          label="Max network creates per day (platform-wide)"
          type="number"
          size="small"
          value={maxPerDay}
          onChange={(e) => setMaxPerDay(Number(e.target.value))}
          sx={{ mb: 1, minWidth: 280 }}
        />
        <Box>
          <Button variant="contained" onClick={() => void saveSettings()}>
            Save caps
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ ...brutalPaperSx, p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Network nodes
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Each row is an isolated tenant. Pausing blocks non-admin members from using
          that network. Members can belong to multiple networks (shared users).
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Network ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Members</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Created by</TableCell>
              <TableCell>Provisioning</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {networks.map((node) => (
              <TableRow key={node.id}>
                <TableCell>{node.name}</TableCell>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                  >
                    {node.id}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={node.status}
                    color={node.status === "active" ? "success" : "warning"}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{node.memberCount}</TableCell>
                <TableCell>{node.createdAt.slice(0, 10)}</TableCell>
                <TableCell>{node.createdByEmail ?? "—"}</TableCell>
                <TableCell>
                  {node.allowUserProvisioning ? "enabled" : "disabled"}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => void toggleStatus(node)}>
                    {node.status === "active" ? "Pause" : "Activate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper sx={{ ...brutalPaperSx, p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Operator controls
        </Typography>
        <Stack spacing={0.75} component="ul" sx={{ m: 0, pl: 2.5 }}>
          <Typography component="li" variant="body2">
            <strong>Pause / activate</strong> — suspend a network for regular members;
            network admins and platform operators retain access.
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Creation caps</strong> — throttle how many networks one email or the
            whole platform can create per day.
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Remove from network</strong> — network admins remove a user from the
            active network only (Admin → User management).
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Platform ban</strong> — revokes all memberships and deletes the
            account platform-wide (network admin user management when available).
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );

  if (!embedded) {
    return (
      <Box>
        <Typography variant="h5" component="h1" gutterBottom>
          Platform administration
        </Typography>
        {content}
      </Box>
    );
  }

  return (
    <AdminCollapsibleSection title="Platform">
      {content}
    </AdminCollapsibleSection>
  );
}
