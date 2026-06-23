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
  getEnvironmentBannerColors,
  isNonProductionEnvironment,
} from "@/lib/env";

interface DevUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

/**
 * Environment banner: fixed tier colors (not user theme) plus impersonation on non-prod.
 */
export function DevBar() {
  const [users, setUsers] = useState<DevUser[]>([]);
  const [pending, startTransition] = useTransition();

  const environment = getAppEnvironment();
  const banner = getEnvironmentBannerColors();
  const showImpersonation = isNonProductionEnvironment();

  useEffect(() => {
    if (!showImpersonation) return;
    void fetch("/api/dev/users")
      .then((r) => r.json())
      .then((data: { users: DevUser[] }) => setUsers(data.users ?? []))
      .catch(() => setUsers([]));
  }, [showImpersonation]);

  return (
    <Box
      component="section"
      aria-label="Environment banner"
      sx={{
        bgcolor: banner.background,
        color: banner.color,
        px: 2,
        py: 0.75,
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        gap: 1,
        borderBottom: 1,
        borderColor: banner.border,
      }}
    >
      <Typography variant="caption" sx={{ flex: 1, color: "inherit" }}>
        PolyCal · {environment.toUpperCase()} · Build {getBuildSha()} · Branch{" "}
        {getBuildBranch()}
      </Typography>
      {showImpersonation && (
        <FormControl size="small" sx={{ minWidth: 220 }} disabled={pending}>
          <InputLabel
            id="impersonate-label"
            sx={{ color: banner.color, opacity: 0.85 }}
          >
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
              color: banner.color,
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: banner.border,
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: banner.color,
              },
              ".MuiSvgIcon-root": { color: banner.color },
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
      )}
    </Box>
  );
}
