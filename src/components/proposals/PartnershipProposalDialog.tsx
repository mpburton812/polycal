"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { respondPartnershipAction } from "@/actions/partnerships";
import type { ProposalCard } from "@/actions/proposals";

import { primaryButtonSx } from "./proposalCardTheme";

interface PartnershipProposalDialogProps {
  card: ProposalCard | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Detail dialog for relationship proposals surfaced on the Proposals Kanban (PC-43).
 */
export function PartnershipProposalDialog({
  card,
  open,
  onClose,
}: PartnershipProposalDialogProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!card || card.cardKind !== "partnership" || !card.partnershipId) {
    return null;
  }

  const partnershipId = card.partnershipId;

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = await respondPartnershipAction({
        partnershipId,
        accept,
      });
      setMessage(result.message);
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Relationship proposal</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body1">{card.title}</Typography>
          {card.description && (
            <Typography variant="body2" color="text.secondary">
              {card.description}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Proposed by {card.proposerName}
          </Typography>
          {message && <Alert severity="info">{message}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        {card.needsViewerAction && (
          <>
            <Button onClick={() => respond(false)} disabled={pending} color="inherit">
              Decline
            </Button>
            <Button
              variant="contained"
              onClick={() => respond(true)}
              disabled={pending}
              sx={primaryButtonSx}
            >
              Accept
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
