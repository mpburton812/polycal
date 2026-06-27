"use client";

import { Button } from "@mui/material";
import { signOut } from "next-auth/react";

/** Sign-out control for paused accounts — no app shell access. */
export function PausedSignOutButton() {
  return (
    <Button variant="contained" onClick={() => void signOut({ callbackUrl: "/login" })}>
      Sign out
    </Button>
  );
}
