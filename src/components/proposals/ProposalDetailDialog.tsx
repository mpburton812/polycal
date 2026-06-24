"use client";

import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  addProposalCommentAction,
  cancelProposalAction,
  castProposalVoteAction,
  deleteDraftProposalAction,
  getProposalDetailAction,
  redraftProposalAction,
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
  return status.replaceAll("_", " ");
}

function formatLogAction(action: string): string {
  return action.replaceAll(".", " · ").replaceAll("_", " ");
}

interface ProposalDetailDialogProps {
  proposalId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit: (detail: ProposalDetail) => void;
}

/**
 * Proposal detail with voting, comments, audit log, and lifecycle actions (PC-40).
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
  const [commentText, setCommentText] = useState("");
  const [pending, startTransition] = useTransition();

  function reloadDetail(id: string) {
    startTransition(async () => {
      const result = await getProposalDetailAction(id);
      if (!result.ok || !result.detail) {
        setError(result.message);
        setDetail(null);
        return;
      }
      setDetail(result.detail);
      setError(null);
    });
  }

  useEffect(() => {
    if (!open || !proposalId) {
      setDetail(null);
      setError(null);
      setMessage(null);
      setCommentText("");
      return;
    }
    reloadDetail(proposalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when proposal changes
  }, [open, proposalId]);

  function handleVote(vote: "accept" | "abstain" | "decline" | "accept_suboptimal") {
    if (!proposalId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await castProposalVoteAction({ proposalId, vote });
      setMessage(result.message);
      if (!result.ok) return;
      reloadDetail(proposalId);
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

  function handleCancel() {
    if (!proposalId || !window.confirm("Cancel this proposal? It will be archived.")) return;
    startTransition(async () => {
      const result = await cancelProposalAction(proposalId);
      setMessage(result.message);
      if (!result.ok) return;
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  function handleRedraft() {
    if (!proposalId || !window.confirm("Move this back to drafts? The calendar entry stays at-risk until resubmitted.")) {
      return;
    }
    startTransition(async () => {
      const result = await redraftProposalAction(proposalId);
      setMessage(result.message);
      if (!result.ok) return;
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  function handleAddComment() {
    if (!proposalId || !commentText.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const result = await addProposalCommentAction({
        proposalId,
        body: commentText.trim(),
      });
      setMessage(result.message);
      if (!result.ok) return;
      setCommentText("");
      reloadDetail(proposalId);
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
                <Chip size="small" label={detail.eventPrivacy} variant="outlined" />
                {detail.isPoll && <Chip size="small" label="Poll" color="info" />}
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
              {detail.isPoll && detail.timeSlots.length > 1 && (
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">Poll options</Typography>
                  {detail.timeSlots.map((slot) => (
                    <Typography key={slot.id} variant="body2" color="text.secondary">
                      {slot.label ? `${slot.label}: ` : ""}
                      {formatWhen(slot.startAt, slot.endAt)}
                    </Typography>
                  ))}
                </Stack>
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
                  {detail.isPoll && (
                    <Button
                      variant="outlined"
                      disabled={pending}
                      onClick={() => handleVote("accept_suboptimal")}
                    >
                      Accept sub-optimal
                    </Button>
                  )}
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
              {detail.canComment && (
                <>
                  <Divider />
                  <Typography variant="subtitle2">Comments</Typography>
                  {detail.comments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No comments yet.
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {detail.comments.map((comment) => (
                        <BoxComment key={comment.id} comment={comment} />
                      ))}
                    </Stack>
                  )}
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Add a comment…"
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                    />
                    <Button
                      variant="outlined"
                      disabled={pending || !commentText.trim()}
                      onClick={handleAddComment}
                    >
                      Post
                    </Button>
                  </Stack>
                </>
              )}
              {detail.stateLog.length > 0 && (
                <>
                  <Divider />
                  <Typography variant="subtitle2">Activity log</Typography>
                  <Stack spacing={0.5}>
                    {detail.stateLog.map((entry, index) => (
                      <Typography key={`${entry.createdAt}-${index}`} variant="caption" color="text.secondary">
                        {new Date(entry.createdAt).toLocaleString()} · {formatLogAction(entry.action)}
                        {entry.actorName ? ` · ${entry.actorName}` : ""}
                      </Typography>
                    ))}
                  </Stack>
                </>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {detail?.canCancel && (
          <Button color="error" onClick={handleCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        {detail?.canRedraft && (
          <Button onClick={handleRedraft} disabled={pending}>
            Re-draft
          </Button>
        )}
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

function BoxComment({
  comment,
}: {
  comment: { authorName: string; body: string; createdAt: string };
}) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {comment.authorName} · {new Date(comment.createdAt).toLocaleString()}
      </Typography>
      <Typography variant="body2">{comment.body}</Typography>
    </Stack>
  );
}
