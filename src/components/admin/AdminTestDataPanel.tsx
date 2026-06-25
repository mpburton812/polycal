"use client";

import {
  Alert,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resetTestDatabaseAction } from "@/actions/admin";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";

/**
 * Admin control to wipe and reseed non-production databases (PC-29).
 */
export function AdminTestDataPanel() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleReset() {
    setMessage(null);
    setError(null);
    const confirmed = window.confirm(
      "Reset the test database? All users, proposals, and activity logs will be replaced with fresh seed data.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await resetTestDatabaseAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <AdminCollapsibleSection title="Test data">
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Wipes Turso data and reloads Star Wars users, locations, and demo
        proposals. Available only in feature, dev, and test environments.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          color="warning"
          onClick={handleReset}
          disabled={pending}
        >
          {pending ? "Resetting…" : "Reset test database"}
        </Button>
      </Stack>
    </AdminCollapsibleSection>
  );
}
