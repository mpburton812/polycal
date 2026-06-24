"use client";

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
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminImpersonateUserAction } from "@/actions/admin";
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
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        User management
      </Typography>
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
              <TableCell>Username</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last login</TableCell>
              <TableCell align="right">Logins</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.displayName}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={user.status}
                    color={user.status === "active" ? "success" : "warning"}
                  />
                </TableCell>
                <TableCell>
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString()
                    : "Never"}
                </TableCell>
                <TableCell align="right">{user.loginCount}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    <Button size="small" disabled={pending} onClick={() => openEdit(user)}>
                      Edit
                    </Button>
                    {user.role === "passive" && user.status === "active" && (
                      <Button
                        size="small"
                        variant="outlined"
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
                        Activate
                      </Button>
                    )}
                    {user.role !== "passive" && user.status === "active" && (
                      <Button
                        size="small"
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
                        Impersonate
                      </Button>
                    )}
                    {user.role !== "passive" && user.status === "active" && (
                      <Button
                        size="small"
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
                        Reset password
                      </Button>
                    )}
                    {user.status === "active" && user.id !== currentUserId && (
                      <Button
                        size="small"
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
                        Pause
                      </Button>
                    )}
                    {user.status === "paused" && (
                      <Button
                        size="small"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await resumeUserAction(user.id);
                            showStatus(result.message, result.ok ? "success" : "error");
                            if (result.ok) router.refresh();
                          })
                        }
                      >
                        Resume
                      </Button>
                    )}
                    {user.id !== currentUserId && user.status !== "deleted" && (
                      <Button
                        size="small"
                        color="error"
                        disabled={pending}
                        onClick={() => setDeleteTarget(user)}
                      >
                        Delete
                      </Button>
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
    </Paper>
  );
}
