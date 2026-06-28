"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  listPartnershipsForUserAction,
  proposePartnershipAction,
  type PartnershipView,
} from "@/actions/partnerships";
import type { PersonSummary } from "@/actions/users";
import { useToast } from "@/components/providers/ToastProvider";

import { primaryButtonSx } from "./proposalCardTheme";

interface SleepingPartnerCreateDialogProps {
  open: boolean;
  onClose: () => void;
  people: PersonSummary[];
  currentUserId: string;
}

/**
 * Propose a sleeping partnership from the Proposals hub (PC-43).
 */
export function SleepingPartnerCreateDialog({
  open,
  onClose,
  people,
  currentUserId,
}: SleepingPartnerCreateDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [partnerships, setPartnerships] = useState<PartnershipView[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    setLoading(true);
    void listPartnershipsForUserAction(currentUserId).then((rows) => {
      setPartnerships(rows);
      setLoading(false);
    });
  }, [open, currentUserId]);

  const blockedPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of partnerships) {
      if (row.status === "accepted" || row.status === "proposed") {
        ids.add(row.partnerId);
      }
    }
    return ids;
  }, [partnerships]);

  const candidates = useMemo(
    () =>
      people.filter(
        (person) =>
          person.id !== currentUserId &&
          person.status === "active" &&
          person.role !== "passive",
      ),
    [people, currentUserId],
  );

  function handleClose() {
    setSelectedId(null);
    onClose();
  }

  function handlePropose() {
    if (!selectedId) return;
    startTransition(async () => {
      const result = await proposePartnershipAction(selectedId);
      showToast(result.message, result.ok ? "success" : "error");
      if (!result.ok) return;
      handleClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Sleeping Partner Proposal</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose someone to propose a sleeping partnership with. People you already partner with
          or have a pending proposal with are unavailable.
        </Typography>
        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Loading…
          </Typography>
        ) : candidates.length === 0 ? (
          <Alert severity="info">No eligible people to propose.</Alert>
        ) : (
          <List disablePadding>
            {candidates.map((person) => {
              const blocked = blockedPartnerIds.has(person.id);
              const partnership = partnerships.find((row) => row.partnerId === person.id);
              const secondary =
                partnership?.status === "accepted"
                  ? "Already partners"
                  : partnership?.status === "proposed"
                    ? "Proposal pending"
                    : undefined;

              return (
                <ListItemButton
                  key={person.id}
                  selected={selectedId === person.id}
                  disabled={blocked || pending}
                  onClick={() => setSelectedId(person.id)}
                >
                  <ListItemText
                    primary={person.displayName}
                    secondary={secondary}
                    primaryTypographyProps={{ color: blocked ? "text.disabled" : undefined }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!selectedId || pending}
          onClick={handlePropose}
          sx={primaryButtonSx}
        >
          Propose
        </Button>
      </DialogActions>
    </Dialog>
  );
}
