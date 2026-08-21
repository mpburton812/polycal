"use client";

import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { PlatformUserRow } from "@/actions/platform-admin";
import type { PlatformSystemLogEntry } from "@/actions/platform-log";
import { AdminPlatformSystemLogPanel } from "@/components/admin/AdminPlatformSystemLogPanel";
import type { PlatformSettings } from "@/types/network";
import { ModerationDialog } from "@/components/platform/ModerationDialog";
import { NetworkDetailDialog } from "@/components/platform/NetworkDetailDialog";
import { OrganicAvatar } from "@/components/ui/OrganicAvatar";
import { avatarSrcForKey } from "@/lib/constants/avatars";
import type { AccountAccessLevel } from "@/lib/users/role-labels";
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

type AssignableAccessLevel = Exclude<AccountAccessLevel, "passive" | "sponsor">;

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
 * Client UI for platform settings, networks, and global user moderation (PC-362 / PC-370).
 */
export function PlatformAdminClient({
  initialNetworks,
  initialSettings,
  initialUsers,
  currentUserId,
  setNetworkStatusAction,
  updatePlatformSettingsAction,
  pauseUserPlatformAction,
  banUserPlatformAction,
  resumeUserPlatformAction,
  deleteUserPlatformAction,
  inhabitNetworkAdminAction,
  setUserAccessLevelAction,
  platformLogEntries = [],
}: {
  initialNetworks: NetworkRow[];
  initialSettings: PlatformSettings;
  initialUsers: PlatformUserRow[];
  currentUserId: string;
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
  setUserAccessLevelAction: (input: {
    userId: string;
    accessLevel: AssignableAccessLevel;
  }) => Promise<{ ok: boolean; message: string; accessLevelLabel?: string }>;
  platformLogEntries?: PlatformSystemLogEntry[];
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
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null);

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

  async function changeAccessLevel(user: PlatformUserRow, accessLevel: AssignableAccessLevel) {
    if (user.id === currentUserId) return;
    if (user.role === "passive") return;
    if (user.accessLevel === accessLevel) return;

    setAccessBusyId(user.id);
    const result = await setUserAccessLevelAction({ userId: user.id, accessLevel });
    setMessage(result.message);
    if (result.ok) {
      setUsers((prev) =>
        prev.map((row) =>
          row.id === user.id
            ? {
                ...row,
                accessLevel,
                accessLevelLabel: result.accessLevelLabel ?? accessLevel,
                isPlatformAdmin: accessLevel === "platform_admin",
                role:
                  accessLevel === "admin"
                    ? "admin"
                    : accessLevel === "user"
                      ? "user"
                      : row.role === "admin"
                        ? "admin"
                        : "user",
              }
            : row,
        ),
      );
      router.refresh();
    }
    setAccessBusyId(null);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, maxWidth: 960 }}>
      <Typography variant="h5" sx={{ fontFamily: fontFamilies.display }}>
        Platform administration
      </Typography>
      {message && <Typography variant="body2">{message}</Typography>}

      <Paper sx={{ ...brutalPaperSx, p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Creation caps
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <TextField
            label="Max networks per email"
            type="number"
            value={maxPerEmail}
            onChange={(e) => setMaxPerEmail(Number(e.target.value))}
            fullWidth
          />
          <TextField
            label="Max network creates per day"
            type="number"
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(Number(e.target.value))}
            fullWidth
          />
          <Box>
            <Button variant="contained" onClick={() => void saveSettings()}>
              Save caps
            </Button>
          </Box>
        </Stack>
      </Paper>

      <AdminPlatformSystemLogPanel entries={platformLogEntries} compact />

      <Paper sx={{ ...brutalPaperSx, p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Message of the day is managed under Admin → Network → Message of the
          day. Platform admins can use the All Platform toggle there.
        </Typography>
      </Paper>

      <Box>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          Networks ({networks.length})
        </Typography>
        <Stack spacing={1.5}>
          {networks.map((network) => (
            <Paper key={network.id} sx={{ ...brutalPaperSx, p: 2 }}>
              <DetailRow label="Network name">{network.name}</DetailRow>
              <Divider />
              <DetailRow label="Status">{network.status}</DetailRow>
              <Divider />
              <DetailRow label="Members">{network.memberCount}</DetailRow>
              <Divider />
              <DetailRow label="Created">{network.createdAt.slice(0, 10)}</DetailRow>
              <Divider />
              <DetailRow label="Actions">
                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ pt: 0.5 }}>
                  <Button size="small" onClick={() => void toggleStatus(network.id, network.status)}>
                    {network.status === "active" ? "Pause network" : "Activate network"}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setDetailNetwork({ id: network.id, name: network.name })}
                  >
                    Detail view
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void inhabitNetwork(network.id)}
                  >
                    Inhabit admin
                  </Button>
                </Stack>
              </DetailRow>
            </Paper>
          ))}
        </Stack>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          All users ({users.length})
        </Typography>
        <Stack spacing={1.5}>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const canChangeAccess = !isSelf && user.role !== "passive";
            const selectValue: AssignableAccessLevel | "passive" | "sponsor" =
              user.accessLevel === "passive" || user.accessLevel === "sponsor"
                ? user.accessLevel
                : user.accessLevel;

            return (
              <Paper
                key={user.id}
                data-testid={`platform-user-${user.username}`}
                sx={{ ...brutalPaperSx, p: 2 }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
                  <OrganicAvatar
                    src={avatarSrcForKey(user.avatarKey)}
                    alt={`${user.displayName} avatar`}
                    label={user.displayName}
                    size={40}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: "anywhere" }}>
                      {user.displayName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      @{user.username}
                    </Typography>
                  </Box>
                </Stack>
                <Divider />
                <DetailRow label="Username">{user.username}</DetailRow>
                <Divider />
                <DetailRow label="Profile name">{user.displayName}</DetailRow>
                <Divider />
                <DetailRow label="Access level">
                  <Typography
                    variant="body2"
                    data-testid={`platform-user-access-${user.username}`}
                  >
                    {user.accessLevelLabel}
                  </Typography>
                </DetailRow>
                <Divider />
                <DetailRow label="Account status">{user.status}</DetailRow>
                <Divider />
                <DetailRow label="Network memberships">
                  {user.networks.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      None
                    </Typography>
                  ) : (
                    <Stack spacing={0.75} sx={{ pt: 0.25 }}>
                      {user.networks.map((network) => (
                        <Typography key={network.networkId} variant="body2">
                          {network.name} — {network.role}
                        </Typography>
                      ))}
                    </Stack>
                  )}
                </DetailRow>
                {(user.moderationReason || user.moderationExpiresAt) && (
                  <>
                    <Divider />
                    <DetailRow label="Moderation">
                      {user.moderationReason && (
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          Reason: {user.moderationReason}
                        </Typography>
                      )}
                      {user.moderationExpiresAt && (
                        <Typography variant="body2" color="text.secondary">
                          Expires: {user.moderationExpiresAt.slice(0, 10)}
                        </Typography>
                      )}
                    </DetailRow>
                  </>
                )}
                <Divider />
                <DetailRow label="Change access level">
                  <FormControl
                    size="small"
                    sx={{ minWidth: 200, mt: 0.5 }}
                    disabled={!canChangeAccess || accessBusyId === user.id}
                  >
                    <InputLabel id={`access-level-${user.id}`}>Access level</InputLabel>
                    <Select
                      labelId={`access-level-${user.id}`}
                      label="Access level"
                      value={selectValue}
                      aria-label={`Access level for ${user.displayName}`}
                      onChange={(e) => {
                        const next = e.target.value as AssignableAccessLevel | "passive" | "sponsor";
                        if (next === "passive" || next === "sponsor") return;
                        void changeAccessLevel(user, next);
                      }}
                    >
                      <MenuItem value="platform_admin">Platform Admin</MenuItem>
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="user">User</MenuItem>
                      {user.accessLevel === "sponsor" && (
                        <MenuItem value="sponsor" disabled>
                          Sponsor
                        </MenuItem>
                      )}
                      {user.accessLevel === "passive" && (
                        <MenuItem value="passive" disabled>
                          Proxy
                        </MenuItem>
                      )}
                    </Select>
                  </FormControl>
                  {isSelf && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      You cannot change your own access level.
                    </Typography>
                  )}
                </DetailRow>
                <Divider />
                <DetailRow label="Actions">
                  <Stack direction="row" flexWrap="wrap" gap={1} sx={{ pt: 0.5 }}>
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
                          Pause user
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
                          Ban user
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
                          Delete user
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
                        Resume user
                      </Button>
                    )}
                  </Stack>
                </DetailRow>
              </Paper>
            );
          })}
        </Stack>
      </Box>

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
