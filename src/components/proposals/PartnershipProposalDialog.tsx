"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  respondPartnershipAction,
  withdrawPartnershipProposalAction,
} from "@/actions/partnerships";
import type { ProposalCard } from "@/actions/proposals";
import { useToast } from "@/components/providers/ToastProvider";

import { primaryButtonSx } from "./proposalCardTheme";

interface PartnershipProposalDialogProps {
  card: ProposalCard | null;
  open: boolean;
  currentUserId: string;
  onClose: () => void;
}

/**
 * Detail dialog for relationship proposals surfaced on the Proposals Kanban (PC-43).
 */
export function PartnershipProposalDialog({
  card,
  open,
  currentUserId,
  onClose,
}: PartnershipProposalDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [commentText, setCommentText] = useState("");

  if (!card || card.cardKind !== "partnership" || !card.partnershipId) {
    return null;
  }

  const partnershipId = card.partnershipId;
  const isProposer = card.proposerId === currentUserId;
  const canRespond = card.needsViewerAction && !isProposer;
  const canWithdraw = isProposer;

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = await respondPartnershipAction({
        partnershipId,
        accept,
        comment: commentText.trim() || undefined,
      });
      showToast(result.message, result.ok ? "success" : "error");
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  function withdraw() {
    startTransition(async () => {
      const result = await withdrawPartnershipProposalAction(partnershipId);
      showToast(result.message, result.ok ? "success" : "error");
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
          <Alert severity="info" sx={{ py: 0.5 }}>
            Visible only to the proposer, invitee, and admins.
          </Alert>
          <Typography variant="body1">{card.title}</Typography>
          {card.description && (
            <Typography variant="body2" color="text.secondary">
              {card.description}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {card.proposerName === "You" ? "Proposed by you" : `Proposed by ${card.proposerName}`}
          </Typography>
          {canRespond && (
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={1}
              maxRows={3}
              placeholder="Add a comment (optional)…"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        {canWithdraw && (
          <Button onClick={withdraw} disabled={pending} color="error">
            Withdraw
          </Button>
        )}
        {canRespond && (
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
