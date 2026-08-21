"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HowToRegOutlinedIcon from "@mui/icons-material/HowToRegOutlined";
import LockResetIcon from "@mui/icons-material/LockReset";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import SwitchAccountOutlinedIcon from "@mui/icons-material/SwitchAccountOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { adminImpersonateUserAction } from "@/actions/admin";
import { setUserAccessLevelAction } from "@/actions/platform-admin";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { ModerationDialog } from "@/components/platform/ModerationDialog";
import type { AdminUserRow } from "@/actions/users";
import {
  activatePassiveUserAction,
  adminResetPasswordAction,
  checkUsernameAvailableAction,
  deleteUserAction,
  pauseUserAction,
  resumeUserAction,
  updateUserAction,
} from "@/actions/users";
import { AVATAR_OPTIONS } from "@/lib/constants/avatars";
import {
  formatAccessLevel,
  resolveAccessLevel,
  type AccountAccessLevel,
} from "@/lib/users/role-labels";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
import { GARDEN_TOKENS, ORGANIC_RADIUS, STROKE_DEFAULT } from "@/theme/tokens";

type AssignableAccessLevel = Exclude<AccountAccessLevel, "passive">;

/**
 * Admin user management with edit, impersonate, and delete (PC-31 / PC-178 / PC-369).
 */
export function AdminUserManagementPanel({
  users,
  currentUserId,
  canManagePlatformAdmin = false,
  impersonationEnabled = false,
}: {
  users: AdminUserRow[];
  currentUserId: string;
  /** When true, platform admins can elevate access levels (PC-369). */
  canManagePlatformAdmin?: boolean;
  /** When true, Impersonate is offered (AUTH_IMPERSONATION_SECRET configured) — PC-179. */
  impersonationEnabled?: boolean;
}) {
  const theme = useTheme();
  /** Stack identity + actions on two lines below md so phones stay tappable (PC-178). */
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [messageSeverity, setMessageSeverity] = useState<"success" | "error" | "info">("info");
  const [credentials, setCredentials] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [pauseTarget, setPauseTarget] = useState<AdminUserRow | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
  const [editAccessLevel, setEditAccessLevel] = useState<AssignableAccessLevel>("user");
  const [editGender, setEditGender] = useState("");
  const [editAvatarKey, setEditAvatarKey] = useState<string>(AVATAR_OPTIONS[0].key);
  const [editUsernameStatus, setEditUsernameStatus] = useState({
    checked: false,
    available: false,
    message: "",
  });

  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);

  const [activateUser, setActivateUser] = useState<AdminUserRow | null>(null);
  const [activateUsername, setActivateUsername] = useState("");
  const [activateEmail, setActivateEmail] = useState("");
  const [activateRole, setActivateRole] = useState<"user" | "admin">("user");
  const [activateUsernameStatus, setActivateUsernameStatus] = useState({
    checked: false,
    available: false,
    message: "",
  });

  function showStatus(text: string, severity: "success" | "error" | "info" = "info") {
    setMessage(text);
    setMessageSeverity(severity);
  }

  function openEdit(user: AdminUserRow) {
    setEditUser(user);
    setEditDisplayName(user.displayName);
    setEditUsername(user.username);
    setEditRole(user.role === "admin" ? "admin" : "user");
    const level = resolveAccessLevel({
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    setEditAccessLevel(level === "passive" ? "user" : level);
    setEditGender(user.gender ?? "");
    setEditAvatarKey(user.avatarKey ?? AVATAR_OPTIONS[0].key);
    setEditUsernameStatus(
      user.role === "passive"
        ? { checked: false, available: false, message: "" }
        : { checked: true, available: true, message: "Username unchanged." },
    );
  }

  function accessLabel(user: AdminUserRow): string {
    if (user.networkRole === "sponsor") return "Sponsor";
    return formatAccessLevel({
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      networkRole: user.networkRole,
    });
  }

  function isSponsorUser(user: AdminUserRow | null): boolean {
    return user?.networkRole === "sponsor";
  }

  function checkEditUsername(userId: string) {
    if (!editUsername.trim()) return;
    startTransition(async () => {
      const result = await checkUsernameAvailableAction(editUsername, userId);
      setEditUsernameStatus({
        checked: true,
        available: result.available,
        message: result.message,
      });
    });
  }

  function checkActivateUsername() {
    if (!activateUsername.trim()) return;
    startTransition(async () => {
      const result = await checkUsernameAvailableAction(activateUsername);
      setActivateUsernameStatus({
        checked: true,
        available: result.available,
        message: result.message,
      });
    });
  }

  function statusChip(user: AdminUserRow): ReactNode {
    return (
      <Chip
        size="small"
        label={user.status}
        color={
          user.status === "active"
            ? "success"
            : user.status === "paused"
              ? "warning"
              : user.status === "deleted"
                ? "error"
                : "default"
        }
        sx={{ maxWidth: "100%" }}
      />
    );
  }

  function userActions(user: AdminUserRow): ReactNode {
    return (
      <Stack direction="row" spacing={0.25} flexWrap="wrap" useFlexGap>
        <Tooltip title="Edit">
          <span>
            <IconButton
              size="small"
              aria-label={`Edit ${user.displayName}`}
              disabled={pending}
              onClick={() => openEdit(user)}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {user.role === "passive" && user.status === "active" && (
          <Tooltip title="Activate">
            <span>
              <IconButton
                size="small"
                aria-label={`Activate ${user.displayName}`}
                disabled={pending}
                onClick={() => {
                  setActivateUser(user);
                  setActivateUsername("");
                  setActivateEmail("");
                  setActivateRole("user");
                  setActivateUsernameStatus({
                    checked: false,
                    available: false,
                    message: "",
                  });
                }}
              >
                <HowToRegOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {impersonationEnabled && user.role !== "passive" && user.status === "active" && (
          <Tooltip title="Impersonate">
            <span>
              <IconButton
                size="small"
                aria-label={`Impersonate ${user.displayName}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await adminImpersonateUserAction(user.id);
                    if (!result.ok) {
                      showStatus(result.message, "error");
                    }
                  })
                }
              >
                <SwitchAccountOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {user.role !== "passive" && user.status === "active" && (
          <Tooltip title="Reset password">
            <span>
              <IconButton
                size="small"
                aria-label={`Reset password for ${user.displayName}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await adminResetPasswordAction({ userId: user.id });
                    showStatus(result.message, result.ok ? "success" : "error");
                    if (result.loginInstructions) {
                      setCredentials(result.loginInstructions);
                    }
                  })
                }
              >
                <LockResetIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {user.status === "active" && user.id !== currentUserId && (
          <Tooltip title="Pause">
            <span>
              <IconButton
                size="small"
                aria-label={`Pause ${user.displayName}`}
                color="warning"
                disabled={pending}
                onClick={() => setPauseTarget(user)}
              >
                <PauseCircleOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {user.status === "paused" && (
          <Tooltip title="Resume">
            <span>
              <IconButton
                size="small"
                aria-label={`Resume ${user.displayName}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await resumeUserAction(user.id);
                    showStatus(result.message, result.ok ? "success" : "error");
                    if (result.ok) router.refresh();
                  })
                }
              >
                <PlayCircleOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {user.id !== currentUserId && user.status !== "deleted" && !isSponsorUser(user) && (
          <Tooltip title="Delete">
            <span>
              <IconButton
                size="small"
                aria-label={`Delete ${user.displayName}`}
                color="error"
                disabled={pending}
                onClick={() => setDeleteTarget(user)}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
    );
  }

  return (
    <AdminCollapsibleSection title="User management">
      {message && (
        <Alert severity={messageSeverity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      {credentials && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 1 }}>
            {credentials}
          </Typography>
          <Button
            size="small"
            onClick={() => void navigator.clipboard.writeText(credentials)}
          >
            Copy instructions
          </Button>
        </Alert>
      )}
      {isCompact ? (
        <Stack spacing={1.5} role="list" aria-label="User management">
          {users.map((user) => (
            <Box
              key={user.id}
              role="listitem"
              sx={{
                p: 1.5,
                border: STROKE_DEFAULT,
                borderRadius: ORGANIC_RADIUS,
                bgcolor: GARDEN_TOKENS.surface,
              }}
            >
              <Stack spacing={1}>
                <Stack spacing={0.5}>
                  <Typography fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                    {user.displayName}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    {[
                      user.gender ?? "—",
                      accessLabel(user),
                      user.lastLoginAt
                        ? `Last login ${new Date(user.lastLoginAt).toLocaleString()}`
                        : "Never logged in",
                    ].join(" · ")}
                  </Typography>
                  {user.networkRole === "sponsor" && (
                    <Chip size="small" label="Sponsor" color="secondary" />
                  )}
                  {statusChip(user)}
                </Stack>
                {userActions(user)}
              </Stack>
            </Box>
          ))}
        </Stack>
      ) : (
        <Box sx={{ width: "100%", overflowX: "visible" }}>
          <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: "20%" }}>Name</TableCell>
                <TableCell sx={{ width: "10%" }}>Gender</TableCell>
                <TableCell sx={{ width: "16%" }}>Access level</TableCell>
                <TableCell sx={{ width: "12%" }}>Status</TableCell>
                <TableCell sx={{ width: "18%" }}>Last login</TableCell>
                <TableCell sx={{ width: "24%" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell sx={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {user.displayName}
                  </TableCell>
                  <TableCell sx={{ overflowWrap: "anywhere" }}>{user.gender ?? "—"}</TableCell>
                  <TableCell sx={{ overflowWrap: "anywhere" }}>
                    {user.networkRole === "sponsor" ? (
                      <Chip size="small" label="Sponsor" color="secondary" data-testid="sponsor-chip" />
                    ) : (
                      accessLabel(user)
                    )}
                  </TableCell>
                  <TableCell>{statusChip(user)}</TableCell>
                  <TableCell sx={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell>{userActions(user)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete user?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete {deleteTarget?.displayName}? Their partnerships and place links will be
            removed. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!deleteTarget) return;
                const result = await deleteUserAction(deleteTarget.id);
                showStatus(result.message, result.ok ? "success" : "error");
                setDeleteTarget(null);
                if (result.ok) router.refresh();
              })
            }
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editUser)} onClose={() => setEditUser(null)} fullWidth maxWidth="sm">
        <DialogTitle>Edit user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Display name"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              fullWidth
              required
              inputProps={{ maxLength: LONG_TEXT_MAX }}
            />
            <TextField
              label="Gender"
              value={editGender}
              onChange={(e) => setEditGender(e.target.value)}
              fullWidth
              helperText="Optional — shown in admin user list."
              inputProps={{ maxLength: 40 }}
            />
            {editUser?.role !== "passive" && (
              <>
                <TextField
                  label="Username"
                  value={editUsername}
                  onChange={(e) => {
                    setEditUsername(e.target.value);
                    setEditUsernameStatus({ checked: false, available: false, message: "" });
                  }}
                  onBlur={() => editUser && checkEditUsername(editUser.id)}
                  fullWidth
                  required
                  error={editUsernameStatus.checked && !editUsernameStatus.available}
                  helperText={
                    editUsernameStatus.checked
                      ? editUsernameStatus.message
                      : "Availability is checked when you leave this field."
                  }
                />
                {isSponsorUser(editUser) ? (
                  <Stack spacing={1}>
                    <Chip label="Sponsor" color="secondary" data-testid="sponsor-chip" />
                    {canManagePlatformAdmin && editUser.id !== currentUserId ? (
                      <FormControl fullWidth>
                        <InputLabel id="edit-sponsor-platform-admin-label">
                          Platform operator
                        </InputLabel>
                        <Select
                          labelId="edit-sponsor-platform-admin-label"
                          label="Platform operator"
                          value={editAccessLevel === "platform_admin" ? "platform_admin" : "sponsor"}
                          onChange={(e) =>
                            setEditAccessLevel(
                              e.target.value === "platform_admin" ? "platform_admin" : "admin",
                            )
                          }
                        >
                          <MenuItem value="sponsor">Keep Sponsor</MenuItem>
                          <MenuItem value="platform_admin">Also Platform Admin</MenuItem>
                        </Select>
                      </FormControl>
                    ) : null}
                  </Stack>
                ) : canManagePlatformAdmin && editUser?.id !== currentUserId ? (
                  <FormControl fullWidth>
                    <InputLabel id="edit-user-access-level-label">Access level</InputLabel>
                    <Select
                      labelId="edit-user-access-level-label"
                      label="Access level"
                      value={editAccessLevel}
                      data-testid="edit-user-access-level"
                      onChange={(e) => {
                        const next = e.target.value as AssignableAccessLevel;
                        setEditAccessLevel(next);
                        if (next === "admin" || next === "user") {
                          setEditRole(next);
                        }
                      }}
                    >
                      <MenuItem value="platform_admin">Platform Admin</MenuItem>
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="user">User</MenuItem>
                    </Select>
                  </FormControl>
                ) : (
                  <FormControl fullWidth>
                    <InputLabel>Role</InputLabel>
                    <Select
                      label="Role"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as "user" | "admin")}
                    >
                      <MenuItem value="user">User</MenuItem>
                      <MenuItem value="admin">Admin</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </>
            )}
            <FormControl fullWidth>
              <InputLabel>Avatar</InputLabel>
              <Select
                label="Avatar"
                value={editAvatarKey}
                onChange={(e) => setEditAvatarKey(e.target.value)}
              >
                {AVATAR_OPTIONS.map((option) => (
                  <MenuItem key={option.key} value={option.key}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditUser(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              pending ||
              !editDisplayName.trim() ||
              (editUser?.role !== "passive" &&
                editUsername !== editUser?.username &&
                (!editUsernameStatus.checked || !editUsernameStatus.available))
            }
            onClick={() =>
              startTransition(async () => {
                if (!editUser) return;
                const result = await updateUserAction({
                  userId: editUser.id,
                  displayName: editDisplayName,
                  avatarKey: editAvatarKey,
                  gender: editGender.trim() || null,
                  ...(editUser.role !== "passive"
                    ? {
                        username: editUsername,
                        ...(isSponsorUser(editUser)
                          ? {}
                          : {
                              role:
                                canManagePlatformAdmin && editUser.id !== currentUserId
                                  ? editAccessLevel === "admin"
                                    ? "admin"
                                    : editAccessLevel === "user"
                                      ? "user"
                                      : editRole
                                  : editRole,
                            }),
                      }
                    : {}),
                });
                if (!result.ok) {
                  showStatus(result.message, "error");
                  return;
                }

                if (
                  canManagePlatformAdmin &&
                  editUser.role !== "passive" &&
                  editUser.id !== currentUserId
                ) {
                  const currentLevel = resolveAccessLevel({
                    role: editUser.role,
                    isPlatformAdmin: editUser.isPlatformAdmin,
                  });
                  if (currentLevel !== editAccessLevel) {
                    const accessResult = await setUserAccessLevelAction({
                      userId: editUser.id,
                      accessLevel: editAccessLevel,
                    });
                    showStatus(
                      accessResult.ok
                        ? `${result.message} ${accessResult.message}`
                        : accessResult.message,
                      accessResult.ok ? "success" : "error",
                    );
                    if (!accessResult.ok) return;
                  } else {
                    showStatus(result.message, "success");
                  }
                } else {
                  showStatus(result.message, "success");
                }

                setEditUser(null);
                router.refresh();
              })
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(activateUser)}
        onClose={() => setActivateUser(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Activate proxy user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Username"
              value={activateUsername}
              onChange={(e) => {
                setActivateUsername(e.target.value);
                setActivateUsernameStatus({ checked: false, available: false, message: "" });
              }}
              onBlur={() => checkActivateUsername()}
              fullWidth
              required
              error={activateUsernameStatus.checked && !activateUsernameStatus.available}
              helperText={
                activateUsernameStatus.checked ? activateUsernameStatus.message : undefined
              }
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                label="Role"
                value={activateRole}
                onChange={(e) => setActivateRole(e.target.value as "user" | "admin")}
              >
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Notification email (optional)"
              type="email"
              value={activateEmail}
              onChange={(e) => setActivateEmail(e.target.value)}
              fullWidth
              helperText="If set, login instructions are emailed."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActivateUser(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              pending ||
              !activateUsernameStatus.checked ||
              !activateUsernameStatus.available
            }
            onClick={() =>
              startTransition(async () => {
                if (!activateUser) return;
                const result = await activatePassiveUserAction({
                  userId: activateUser.id,
                  username: activateUsername,
                  role: activateRole,
                  notificationEmail: activateEmail.trim() || undefined,
                });
                showStatus(result.message, result.ok ? "success" : "error");
                if (result.ok && result.loginInstructions) {
                  setCredentials(result.loginInstructions);
                  setActivateUser(null);
                  router.refresh();
                }
              })
            }
          >
            Activate
          </Button>
        </DialogActions>
      </Dialog>

      <ModerationDialog
        open={Boolean(pauseTarget)}
        title={pauseTarget ? `Pause ${pauseTarget.displayName}` : ""}
        confirmLabel="Pause user"
        onClose={() => setPauseTarget(null)}
        onConfirm={async ({ reason, durationDays }) => {
          if (!pauseTarget) return;
          const result = await pauseUserAction(pauseTarget.id, { reason, durationDays });
          showStatus(result.message, result.ok ? "success" : "error");
          if (result.ok) {
            setPauseTarget(null);
            router.refresh();
          }
        }}
      />
    </AdminCollapsibleSection>
  );
}
