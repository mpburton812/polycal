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
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PlatformUserRow } from "@/actions/platform-admin";
import type { PlatformSettings } from "@/types/network";
import { ModerationDialog } from "@/components/platform/ModerationDialog";
import { NetworkDetailDialog } from "@/components/platform/NetworkDetailDialog";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";

type NetworkRow = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  memberCount: number;
};

type ModerationTarget = { userId: string; displayName: string; kind: "pause" | "ban" };

/**
 * Client UI for platform settings, networks, and global user moderation (PC-362).
 */
export function PlatformAdminClient({
  initialNetworks,
  initialSettings,
  initialUsers,
  setNetworkStatusAction,
  updatePlatformSettingsAction,
  pauseUserPlatformAction,
  banUserPlatformAction,
  resumeUserPlatformAction,
  deleteUserPlatformAction,
  inhabitNetworkAdminAction,
}: {
  initialNetworks: NetworkRow[];
  initialSettings: PlatformSettings;
  initialUsers: PlatformUserRow[];
  setNetworkStatusAction: (
    networkId: string,
    status: "active" | "paused",
  ) => Promise<{ ok: boolean; message: string }>;
  updatePlatformSettingsAction: (input: {
    maxNetworksPerEmail: number;
    maxNetworkCreatesPerDay: number;
  }) => Promise<{ ok: boolean; message: string }>;
  pauseUserPlatformAction: (input: {
    userId: string;
    reason: string;
    durationDays?: number;
  }) => Promise<{ ok: boolean; message: string }>;
  banUserPlatformAction: (input: {
    userId: string;
    reason: string;
    durationDays?: number;
  }) => Promise<{ ok: boolean; message: string }>;
  resumeUserPlatformAction: (userId: string) => Promise<{ ok: boolean; message: string }>;
  deleteUserPlatformAction: (userId: string) => Promise<{ ok: boolean; message: string }>;
  inhabitNetworkAdminAction: (
    networkId: string,
  ) => Promise<{ ok: boolean; message: string; networkId?: string; networkName?: string }>;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [networks, setNetworks] = useState(initialNetworks);
  const [users, setUsers] = useState(initialUsers);
  const [maxPerEmail, setMaxPerEmail] = useState(initialSettings.maxNetworksPerEmail);
  const [maxPerDay, setMaxPerDay] = useState(initialSettings.maxNetworkCreatesPerDay);
  const [message, setMessage] = useState<string | null>(null);
  const [detailNetwork, setDetailNetwork] = useState<{ id: string; name: string } | null>(null);
  const [moderationTarget, setModerationTarget] = useState<ModerationTarget | null>(null);

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

  async function inhabitNetwork(networkId: string) {
    const result = await inhabitNetworkAdminAction(networkId);
    setMessage(result.message);
    if (result.ok && result.networkId) {
      await update({
        user: {
          activeNetworkId: result.networkId,
          activeNetworkRole: "network_admin",
        },
      });
      router.push("/admin");
      router.refresh();
    }
  }

  async function handleModerationConfirm(input: { reason: string; durationDays?: number }) {
    if (!moderationTarget) return;
    const action =
      moderationTarget.kind === "pause" ? pauseUserPlatformAction : banUserPlatformAction;
    const result = await action({
      userId: moderationTarget.userId,
      reason: input.reason,
      durationDays: input.durationDays,
    });
    setMessage(result.message);
    if (result.ok) {
      setUsers((prev) =>
        prev.map((user) =>
          user.id === moderationTarget.userId
            ? {
                ...user,
                status: moderationTarget.kind === "pause" ? "paused" : "banned",
                moderationReason: input.reason,
              }
            : user,
        ),
      );
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h5" sx={{ fontFamily: fontFamilies.display }}>
        Platform administration
      </Typography>
      {message && <Typography variant="body2">{message}</Typography>}

      <Paper sx={{ ...brutalPaperSx, p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
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

      <Paper sx={{ ...brutalPaperSx, p: 2, overflow: "hidden" }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Networks
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Table
            size="small"
            sx={{
              tableLayout: "fixed",
              width: "100%",
              "& th, & td": {
                wordBreak: "break-word",
                whiteSpace: "normal",
                verticalAlign: "top",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: "22%" }}>Name</TableCell>
                <TableCell sx={{ width: "12%" }}>Status</TableCell>
                <TableCell sx={{ width: "10%" }}>Members</TableCell>
                <TableCell sx={{ width: "14%" }}>Created</TableCell>
                <TableCell sx={{ width: "42%" }}>Actions</TableCell>
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
                    <Stack direction="row" flexWrap="wrap" gap={0.5}>
                      <Button size="small" onClick={() => void toggleStatus(n.id, n.status)}>
                        {n.status === "active" ? "Pause" : "Activate"}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setDetailNetwork({ id: n.id, name: n.name })}
                      >
                        Detail view
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void inhabitNetwork(n.id)}
                      >
                        Inhabit admin
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Paper sx={{ ...brutalPaperSx, p: 2, overflow: "hidden" }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          All users
        </Typography>
        <Table
          size="small"
          sx={{
            tableLayout: "fixed",
            width: "100%",
            "& th, & td": {
              wordBreak: "break-word",
              whiteSpace: "normal",
              verticalAlign: "top",
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: "14%" }}>Username</TableCell>
              <TableCell sx={{ width: "16%" }}>Profile name</TableCell>
              <TableCell sx={{ width: "10%" }}>Status</TableCell>
              <TableCell sx={{ width: "30%" }}>Networks</TableCell>
              <TableCell sx={{ width: "30%" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.displayName}</TableCell>
                <TableCell>{user.status}</TableCell>
                <TableCell>
                  {user.networks.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      None
                    </Typography>
                  ) : (
                    <Stack direction="row" flexWrap="wrap" gap={0.5}>
                      {user.networks.map((network) => (
                        <Chip
                          key={network.networkId}
                          size="small"
                          label={`${network.name} (${network.role})`}
                        />
                      ))}
                    </Stack>
                  )}
                </TableCell>
                <TableCell>
                  <Stack direction="row" flexWrap="wrap" gap={0.5}>
                    {user.status === "active" && (
                      <>
                        <Button
                          size="small"
                          onClick={() =>
                            setModerationTarget({
                              userId: user.id,
                              displayName: user.displayName,
                              kind: "pause",
                            })
                          }
                        >
                          Pause
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() =>
                            setModerationTarget({
                              userId: user.id,
                              displayName: user.displayName,
                              kind: "ban",
                            })
                          }
                        >
                          Ban
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Permanently delete ${user.displayName}? This cannot be undone.`,
                              )
                            ) {
                              return;
                            }
                            void deleteUserPlatformAction(user.id).then((result) => {
                              setMessage(result.message);
                              if (result.ok) {
                                setUsers((prev) => prev.filter((row) => row.id !== user.id));
                              }
                            });
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                    {(user.status === "paused" || user.status === "banned") && (
                      <Button
                        size="small"
                        onClick={() =>
                          void resumeUserPlatformAction(user.id).then((result) => {
                            setMessage(result.message);
                            if (result.ok) {
                              setUsers((prev) =>
                                prev.map((row) =>
                                  row.id === user.id ? { ...row, status: "active" } : row,
                                ),
                              );
                            }
                          })
                        }
                      >
                        Resume
                      </Button>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <NetworkDetailDialog
        networkId={detailNetwork?.id ?? null}
        networkName={detailNetwork?.name ?? ""}
        onClose={() => setDetailNetwork(null)}
      />

      <ModerationDialog
        open={Boolean(moderationTarget)}
        title={
          moderationTarget
            ? `${moderationTarget.kind === "pause" ? "Pause" : "Ban"} ${moderationTarget.displayName}`
            : ""
        }
        confirmLabel={moderationTarget?.kind === "pause" ? "Pause user" : "Ban user"}
        onClose={() => setModerationTarget(null)}
        onConfirm={handleModerationConfirm}
      />
    </Box>
  );
}
