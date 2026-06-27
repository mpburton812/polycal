"use client";

import {
  Alert,
  Button,
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
  addResidencyCommentAction,
  deleteDeclinedResidencyAction,
  getResidencyProposalDetailAction,
  respondResidencyAction,
  type ResidencyProposalDetail,
} from "@/actions/places";
import type { ProposalCard } from "@/actions/proposals";
import { useToast } from "@/components/providers/ToastProvider";
import { handleCommentEnterKey } from "@/lib/ui/comment-keydown";

import { primaryButtonSx } from "./proposalCardTheme";

interface ResidencyProposalDialogProps {
  card: ProposalCard | null;
  open: boolean;
  currentUserId: string;
  onClose: () => void;
}

/**
 * Detail dialog for place residency proposals on the Proposals Kanban (PC-56).
 */
export function ResidencyProposalDialog({
  card,
  open,
  currentUserId,
  onClose,
}: ResidencyProposalDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<ResidencyProposalDetail | null>(null);
  const [commentText, setCommentText] = useState("");
  const [pending, startTransition] = useTransition();

  const residencyId = card?.residencyId;

  useEffect(() => {
    if (!open || !residencyId) {
      setDetail(null);
      setCommentText("");
      return;
    }
    startTransition(async () => {
      const result = await getResidencyProposalDetailAction(residencyId);
      if (result.ok && result.detail) {
        setDetail(result.detail);
      } else {
        showToast(result.message, "error");
      }
    });
  }, [open, residencyId, showToast]);

  if (!card || card.cardKind !== "residency" || !card.residencyId) {
    return null;
  }

  const isProposer = card.proposerId === currentUserId;
  const canRespond = card.needsViewerAction && !isProposer;
  const isDeclinedDraft = detail?.status === "declined";

  function reloadDetail() {
    if (!residencyId) return;
    startTransition(async () => {
      const result = await getResidencyProposalDetailAction(residencyId);
      if (result.ok && result.detail) setDetail(result.detail);
    });
  }

  function respond(accept: boolean) {
    if (!residencyId) return;
    startTransition(async () => {
      const result = await respondResidencyAction({
        residencyId,
        accept,
      });
      showToast(result.message, result.ok ? "success" : "error");
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  function handleAddComment() {
    if (!commentText.trim() || !residencyId) return;
    startTransition(async () => {
      const result = await addResidencyCommentAction({
        residencyId,
        body: commentText.trim(),
      });
      showToast(result.message, result.ok ? "success" : "error");
      if (!result.ok) return;
      setCommentText("");
      reloadDetail();
    });
  }

  function removeDeclinedDraft() {
    if (!residencyId) return;
    startTransition(async () => {
      const result = await deleteDeclinedResidencyAction(residencyId);
      showToast(result.message, result.ok ? "success" : "error");
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Place residency proposal</DialogTitle>
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
            {detail ? ` · ${detail.inviteeName}` : ""}
          </Typography>

          {detail && detail.comments.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2">Comments</Typography>
              {detail.comments.map((comment) => (
                <Typography key={`${comment.createdAt}-${comment.body}`} variant="body2">
                  <strong>{comment.authorName}:</strong> {comment.body}
                </Typography>
              ))}
            </>
          )}

          {!isDeclinedDraft && (
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={1}
                maxRows={4}
                placeholder="Add a comment…"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                onKeyDown={(event) =>
                  handleCommentEnterKey(event, handleAddComment, Boolean(commentText.trim()) && !pending)
                }
              />
              <Button
                variant="outlined"
                disabled={pending || !commentText.trim()}
                onClick={handleAddComment}
              >
                Post
              </Button>
            </Stack>
          )}

          {detail && detail.activityLog.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2">Activity</Typography>
              {detail.activityLog.map((entry) => (
                <Typography
                  key={`${entry.createdAt}-${entry.action}`}
                  variant="caption"
                  color="text.secondary"
                  display="block"
                >
                  {entry.action.replaceAll("_", " ")} · {new Date(entry.createdAt).toLocaleString()}
                </Typography>
              ))}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        {isDeclinedDraft && isProposer && (
          <Button onClick={removeDeclinedDraft} disabled={pending} color="error">
            Delete draft
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
