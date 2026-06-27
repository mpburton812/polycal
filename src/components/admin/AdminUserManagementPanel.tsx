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
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminImpersonateUserAction } from "@/actions/admin";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
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

/**
 * Admin user management with edit, impersonate, and delete (PC-31).
 */
export function AdminUserManagementPanel({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [messageSeverity, setMessageSeverity] = useState<"success" | "error" | "info">("info");
  const [credentials, setCredentials] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
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
    setEditGender(user.gender ?? "");
    setEditAvatarKey(AVATAR_OPTIONS[0].key);
    setEditUsernameStatus(
      user.role === "passive"
        ? { checked: false, available: false, message: "" }
        : { checked: true, available: true, message: "Username unchanged." },
    );
  }

  function checkEditUsername(userId: string, currentUsername: string) {
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
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Gender</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last login</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.displayName}</TableCell>
                <TableCell>{user.gender ?? "—"}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
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
                  />
                </TableCell>
                <TableCell>
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString()
                    : "Never"}
                </TableCell>
                <TableCell>
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
                    {user.role !== "passive" && user.status === "active" && (
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
                            onClick={() =>
                              startTransition(async () => {
                                const result = await pauseUserAction(user.id);
                                showStatus(result.message, result.ok ? "success" : "error");
                                if (result.ok) router.refresh();
                              })
                            }
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
                    {user.id !== currentUserId && user.status !== "deleted" && (
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

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
            />
            <TextField
              label="Gender"
              value={editGender}
              onChange={(e) => setEditGender(e.target.value)}
              fullWidth
              helperText="Optional — shown in admin user list."
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
                  onBlur={() => editUser && checkEditUsername(editUser.id, editUser.username)}
                  fullWidth
                  required
                  error={editUsernameStatus.checked && !editUsernameStatus.available}
                  helperText={
                    editUsernameStatus.checked
                      ? editUsernameStatus.message
                      : "Availability is checked when you leave this field."
                  }
                />
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
                    ? { username: editUsername, role: editRole }
                    : {}),
                });
                showStatus(result.message, result.ok ? "success" : "error");
                if (result.ok) {
                  setEditUser(null);
                  router.refresh();
                }
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
        <DialogTitle>Activate passive user</DialogTitle>
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
    </AdminCollapsibleSection>
  );
}
