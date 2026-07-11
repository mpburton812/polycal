"use client";

import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useEffect, useState, useTransition } from "react";

import { impersonateUser } from "@/actions/dev";
import { isNonProductionEnvironment } from "@/lib/env";

interface DevUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

/**
 * Non-production impersonation control for Admin (PC-149).
 * Replaces the removed environment build/branch banner.
 */
export function AdminImpersonationPanel() {
  const [users, setUsers] = useState<DevUser[]>([]);
  const [pending, startTransition] = useTransition();
  const showImpersonation = isNonProductionEnvironment();

  useEffect(() => {
    if (!showImpersonation) return;
    void fetch("/api/dev/users")
      .then((r) => r.json())
      .then((data: { users: DevUser[] }) => setUsers(data.users ?? []))
      .catch(() => setUsers([]));
  }, [showImpersonation]);

  if (!showImpersonation) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        Impersonate user
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Non-production only — switch session to another seeded account for testing.
      </Typography>
      <FormControl size="small" sx={{ minWidth: 260 }} disabled={pending}>
        <InputLabel id="admin-impersonate-label">Impersonate user</InputLabel>
        <Select
          labelId="admin-impersonate-label"
          label="Impersonate user"
          defaultValue=""
          onChange={(e) => {
            const userId = e.target.value;
            if (!userId) return;
            startTransition(async () => {
              await impersonateUser(userId);
            });
          }}
        >
          <MenuItem value="">
            <em>Select user…</em>
          </MenuItem>
          {users.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.displayName} ({u.username})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
