"use client";

import {
  Alert,
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
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { AdminUserRow } from "@/actions/users";
import {
  adminResetPasswordAction,
  deleteUserAction,
  pauseUserAction,
  resumeUserAction,
} from "@/actions/users";

/**
 * Admin user management table with pause/resume/delete and password reset (PC-31).
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
  const [credentials, setCredentials] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setMessage("Copied to clipboard.");
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        User management
      </Typography>
      {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}
      {credentials && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 1 }}>
            {credentials}
          </Typography>
          <Button size="small" onClick={() => void copyText(credentials)}>
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
              <TableCell>Gender</TableCell>
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
                <TableCell>{user.gender ?? "—"}</TableCell>
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
                    {user.role !== "passive" && user.status === "active" && (
                      <Button
                        size="small"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await adminResetPasswordAction({ userId: user.id });
                            setMessage(result.message);
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
                            setMessage(result.message);
                            router.refresh();
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
                            setMessage(result.message);
                            router.refresh();
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
                        onClick={() =>
                          startTransition(async () => {
                            if (
                              !window.confirm(
                                `Delete ${user.displayName}? This cannot be undone.`,
                              )
                            ) {
                              return;
                            }
                            const result = await deleteUserAction(user.id);
                            setMessage(result.message);
                            router.refresh();
                          })
                        }
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
    </Paper>
  );
}
