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
import {
  getAppEnvironment,
  getBuildBranch,
  getBuildSha,
  isNonProductionEnvironment,
} from "@/lib/env";

interface DevUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

/**
 * Non-production strip: build metadata + quick user impersonation for QA.
 * Hidden on production per spec §1.
 */
export function DevBar() {
  const [users, setUsers] = useState<DevUser[]>([]);
  const [pending, startTransition] = useTransition();

  const showBar = isNonProductionEnvironment();

  useEffect(() => {
    if (!showBar) return;
    void fetch("/api/dev/users")
      .then((r) => r.json())
      .then((data: { users: DevUser[] }) => setUsers(data.users ?? []))
      .catch(() => setUsers([]));
  }, [showBar]);

  if (!showBar) return null;

  return (
    <Box
      component="section"
      aria-label="Development tools"
      sx={{
        bgcolor: "grey.900",
        color: "grey.100",
        px: 2,
        py: 0.75,
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        gap: 1,
        borderBottom: 1,
        borderColor: "grey.800",
      }}
    >
      <Typography variant="caption" sx={{ flex: 1 }}>
        Build {getBuildSha()} · Branch {getBuildBranch()} · Env{" "}
        {getAppEnvironment()}
      </Typography>
      <FormControl size="small" sx={{ minWidth: 220 }} disabled={pending}>
        <InputLabel id="impersonate-label" sx={{ color: "grey.400" }}>
          Impersonate user
        </InputLabel>
        <Select
          labelId="impersonate-label"
          label="Impersonate user"
          defaultValue=""
          onChange={(e) => {
            const userId = e.target.value;
            if (!userId) return;
            startTransition(async () => {
              await impersonateUser(userId);
            });
          }}
          sx={{
            color: "grey.100",
            ".MuiOutlinedInput-notchedOutline": { borderColor: "grey.600" },
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
