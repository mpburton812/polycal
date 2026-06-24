"use client";

import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  castProposalVoteAction,
  deleteDraftProposalAction,
  getProposalDetailAction,
  submitProposalAction,
  type ProposalDetail,
} from "@/actions/proposals";

function formatWhen(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const startLabel = new Date(start).toLocaleString();
  if (!end) return startLabel;
  return `${startLabel} – ${new Date(end).toLocaleString()}`;
}

function voteLabel(status: string): string {
  if (status === "not_seen") return "Not yet viewed";
  return status.replace("_", " ");
}

interface ProposalDetailDialogProps {
  proposalId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit: (detail: ProposalDetail) => void;
}

/**
 * Proposal detail with invitee status and voting actions (PC-40).
 */
export function ProposalDetailDialog({
  proposalId,
  open,
  onClose,
  onEdit,
}: ProposalDetailDialogProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !proposalId) {
      setDetail(null);
      setError(null);
      setMessage(null);
      return;
    }

    startTransition(async () => {
      const result = await getProposalDetailAction(proposalId);
      if (!result.ok || !result.detail) {
        setError(result.message);
        setDetail(null);
        return;
      }
      setDetail(result.detail);
      setError(null);
    });
  }, [open, proposalId]);

  function handleVote(vote: "accept" | "abstain" | "decline") {
    if (!proposalId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await castProposalVoteAction({ proposalId, vote });
      setMessage(result.message);
      if (!result.ok) return;
      const refreshed = await getProposalDetailAction(proposalId);
      if (refreshed.detail) setDetail(refreshed.detail);
      router.refresh();
    });
  }

  function handleSubmit() {
    if (!proposalId) return;
    startTransition(async () => {
      const result = await submitProposalAction(proposalId);
      setMessage(result.message);
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!proposalId || !window.confirm("Delete this draft?")) return;
    startTransition(async () => {
      const result = await deleteDraftProposalAction(proposalId);
      setMessage(result.message);
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  const whenLabel = detail
    ? formatWhen(detail.scheduledStartAt, detail.scheduledEndAt) ??
      (detail.timeSlots[0]
        ? formatWhen(detail.timeSlots[0].startAt, detail.timeSlots[0].endAt)
        : null)
    : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{detail?.title ?? "Proposal"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {message && <Alert severity="info">{message}</Alert>}
          {detail && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip size="small" label={detail.proposalType} />
                <Chip size="small" label={detail.state} variant="outlined" />
                {detail.atRisk && <Chip size="small" label="At risk" color="warning" />}
              </Stack>
              <Typography variant="body2">{detail.description}</Typography>
              {detail.notes && (
                <Typography variant="body2" color="text.secondary">
                  Notes: {detail.notes}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Proposer: {detail.proposerName}
                {detail.locationName ? ` · ${detail.locationName}` : ""}
              </Typography>
              {whenLabel && (
                <Typography variant="body2" color="text.secondary">
                  When: {whenLabel}
                </Typography>
              )}
              <Typography variant="subtitle2">Invitees</Typography>
              {detail.invitees.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No invitees selected.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {detail.invitees.map((invitee) => (
                    <Stack key={invitee.userId} direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2">{invitee.displayName}</Typography>
                      <Chip size="small" label={invitee.role} variant="outlined" />
                      <Chip size="small" label={voteLabel(invitee.voteStatus)} />
                    </Stack>
                  ))}
                </Stack>
              )}
              {detail.canVote && (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    variant="contained"
                    color="success"
                    disabled={pending}
                    onClick={() => handleVote("accept")}
                  >
                    Accept
                  </Button>
                  <Button variant="outlined" disabled={pending} onClick={() => handleVote("abstain")}>
                    Abstain
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={pending}
                    onClick={() => handleVote("decline")}
                  >
                    Decline
                  </Button>
                </Stack>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {detail?.canEdit && (
          <>
            <Button color="error" onClick={handleDelete} disabled={pending}>
              Delete
            </Button>
            <Button onClick={() => onEdit(detail)} disabled={pending}>
              Edit
            </Button>
            <Button variant="contained" onClick={handleSubmit} disabled={pending}>
              Submit
            </Button>
          </>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
