"use client";

import {
  Box,
  Button,
  Paper,
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
import type { PlatformSettings } from "@/types/network";
import { brutalPaperSx } from "@/theme/brutalUi";

type NetworkRow = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  memberCount: number;
};

/**
 * Platform operator controls surfaced under Admin (PC-363).
 */
export function AdminPlatformPanel({
  initialNetworks,
  initialSettings,
  setNetworkStatusAction,
  updatePlatformSettingsAction,
}: {
  initialNetworks: NetworkRow[];
  initialSettings: PlatformSettings;
  setNetworkStatusAction: (
    networkId: string,
    status: "active" | "paused",
  ) => Promise<{ ok: boolean; message: string }>;
  updatePlatformSettingsAction: (input: {
    maxNetworksPerEmail: number;
    maxNetworkCreatesPerDay: number;
  }) => Promise<{ ok: boolean; message: string }>;
}) {
  const [networks, setNetworks] = useState(initialNetworks);
  const [maxPerEmail, setMaxPerEmail] = useState(
    initialSettings.maxNetworksPerEmail,
  );
  const [maxPerDay, setMaxPerDay] = useState(
    initialSettings.maxNetworkCreatesPerDay,
  );
  const [message, setMessage] = useState<string | null>(null);

  async function saveSettings() {
    const result = await updatePlatformSettingsAction({
      maxNetworksPerEmail: maxPerEmail,
      maxNetworkCreatesPerDay: maxPerDay,
    });
    setMessage(result.message);
  }

  async function toggleStatus(id: string, status: string) {
    const next = status === "active" ? "paused" : "active";
    const result = await setNetworkStatusAction(id, next);
    setMessage(result.message);
    if (result.ok) {
      setNetworks((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: next } : n)),
      );
    }
  }

  return (
    <AdminCollapsibleSection title="Platform administration">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {message && <Typography variant="body2">{message}</Typography>}

        <Paper sx={{ ...brutalPaperSx, p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Creation caps
          </Typography>
          <TextField
            label="Max networks per email"
            type="number"
            value={maxPerEmail}
            onChange={(e) => setMaxPerEmail(Number(e.target.value))}
            sx={{ mr: 2, mb: 1 }}
          />
          <TextField
            label="Max network creates per day"
            type="number"
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(Number(e.target.value))}
            sx={{ mb: 1 }}
          />
          <Box>
            <Button variant="contained" onClick={() => void saveSettings()}>
              Save caps
            </Button>
          </Box>
        </Paper>

        <Paper sx={{ ...brutalPaperSx, p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            All networks
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Members</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {networks.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>{n.name}</TableCell>
                  <TableCell>{n.status}</TableCell>
                  <TableCell>{n.memberCount}</TableCell>
                  <TableCell>{n.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      onClick={() => void toggleStatus(n.id, n.status)}
                    >
                      {n.status === "active" ? "Pause" : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    </AdminCollapsibleSection>
  );
}
