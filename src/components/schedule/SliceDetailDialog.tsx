"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import {
  Alert,
  Box,
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
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  addProposalCommentAction,
  detachProposalSliceAction,
  getProposalSliceDetailAction,
  type ProposalSliceDetail,
} from "@/actions/proposals";
import type { ScheduleSliceKind } from "@/lib/schedule/slice-types";
import { useToast } from "@/components/providers/ToastProvider";
import { formatEventTime } from "@/lib/schedule/dates";
import { handleCommentEnterKey } from "@/lib/ui/comment-keydown";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
import { primaryButtonSx } from "@/components/proposals/proposalCardTheme";

interface SliceDetailDialogProps {
  open: boolean;
  rootProposalId: string | null;
  sliceKind: ScheduleSliceKind | null;
  sliceKey: string | null;
  timeZone?: string;
  onClose: () => void;
  onViewParent: (parentId: string) => void;
  onDetached?: (newProposalId: string) => void;
}

function sliceKindLabel(kind: ScheduleSliceKind | null): string {
  if (kind === "batch_night") return "This night";
  if (kind === "virtual_span_day") return "This day";
  return "Slice";
}

/**
 * Day/night-scoped read UI for batch and multi-day span virtual slices.
 */
export function SliceDetailDialog({
  open,
  rootProposalId,
  sliceKind,
  sliceKey,
  timeZone = "UTC",
  onClose,
  onViewParent,
  onDetached,
}: SliceDetailDialogProps) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<ProposalSliceDetail | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDetachOpen, setConfirmDetachOpen] = useState(false);
  const loadSeqRef = useRef(0);

  const loadDetail = useCallback(async () => {
    if (!open || !rootProposalId || !sliceKind || !sliceKey) return;
    if (sliceKind !== "batch_night" && sliceKind !== "virtual_span_day") return;

    const seq = ++loadSeqRef.current;
    setError(null);
    setDetail(null);
    const result = await getProposalSliceDetailAction({
      rootProposalId,
      sliceKind,
      sliceKey,
    });
    if (seq !== loadSeqRef.current) return;
    if (!result.ok || !result.detail) {
      setError(result.message);
      setDetail(null);
      return;
    }
    setDetail(result.detail);
  }, [open, rootProposalId, sliceKind, sliceKey]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  function handleAddComment() {
    if (!detail || !comment.trim()) return;
    startTransition(async () => {
      const result = await addProposalCommentAction({
        proposalId: detail.rootProposalId,
        body: comment.trim(),
        sliceTag: detail.sliceTag,
      });
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      setComment("");
      showToast("Comment added.", "success");
      await loadDetail();
    });
  }

  function handleDetach() {
    if (!detail) return;
    setConfirmDetachOpen(true);
  }

  function confirmDetach() {
    if (!detail) return;
    startTransition(async () => {
      const result = await detachProposalSliceAction({
        rootProposalId: detail.rootProposalId,
        sliceKind: detail.sliceKind as "batch_night" | "virtual_span_day",
        sliceKey: detail.sliceKey,
      });
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      setConfirmDetachOpen(false);
      showToast(result.message, "success");
      onClose();
      if (result.newProposalId) {
        onDetached?.(result.newProposalId);
      }
    });
  }

  const timeLabel = detail
    ? formatEventTime(
        detail.startAt,
        detail.endAt,
        detail.proposalType,
        timeZone,
        detail.isAllDay,
      )
    : "";

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{sliceKindLabel(sliceKind)}</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {!detail && !error ? (
          <Typography variant="body2" color="text.secondary">
            Loading slice…
          </Typography>
        ) : null}

        {detail ? (
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">{detail.title}</Typography>
              {detail.parentState === "proposed" ? (
                <Chip size="small" label="Part of proposed series" color="warning" sx={{ mt: 1 }} />
              ) : null}
            </Box>

            <Button
              variant="contained"
              onClick={() => onViewParent(detail.rootProposalId)}
              sx={primaryButtonSx}
            >
              Open parent
            </Button>

            <Stack direction="row" spacing={1} alignItems="center">
              <AccessTimeIcon fontSize="small" color="action" />
              <Typography variant="body2">{timeLabel}</Typography>
            </Stack>

            {detail.locationName ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <LocationOnOutlinedIcon fontSize="small" color="action" />
                <Typography variant="body2">{detail.locationName}</Typography>
              </Stack>
            ) : null}

            {detail.participantNames.length > 0 ? (
              <Typography variant="body2" color="text.secondary">
                With {detail.participantNames.join(", ")}
              </Typography>
            ) : null}

            {detail.description ? (
              <Typography variant="body2">{detail.description}</Typography>
            ) : null}

            {detail.canVoteOnParent ? (
              <Alert severity="info">
                Votes apply to the whole series. Open the full proposal to vote.
              </Alert>
            ) : null}

            <Divider />

            <Typography variant="subtitle2">Comments on this slice</Typography>
            {detail.comments.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No comments yet.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {detail.comments.map((entry) => (
                  <Box key={entry.id}>
                    <Typography variant="caption" color="text.secondary">
                      {entry.authorName}
                      {entry.sliceTag ? ` · ${entry.sliceTag}` : " · series-wide"}
                    </Typography>
                    <Typography variant="body2">{entry.body}</Typography>
                  </Box>
                ))}
              </Stack>
            )}

            {detail.canComment ? (
              <TextField
                label="Add comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={(event) =>
                  handleCommentEnterKey(event, handleAddComment, Boolean(comment.trim()) && !pending)
                }
                multiline
                minRows={2}
                fullWidth
                disabled={pending}
                inputProps={{ maxLength: LONG_TEXT_MAX }}
              />
            ) : null}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {detail?.canComment ? (
          <Button onClick={handleAddComment} disabled={pending || !comment.trim()}>
            Post comment
          </Button>
        ) : null}
        {detail?.canDetach ? (
          <Button color="warning" onClick={handleDetach} disabled={pending}>
            Detach this {sliceKind === "batch_night" ? "night" : "day"}
          </Button>
        ) : null}
        <Button onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>

      <Dialog open={confirmDetachOpen} onClose={() => setConfirmDetachOpen(false)}>
        <DialogTitle>Detach this {sliceKind === "batch_night" ? "night" : "day"}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This creates a separate resolved proposal for this slice and removes it from the parent series.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDetachOpen(false)}>Cancel</Button>
          <Button color="warning" onClick={confirmDetach} disabled={pending}>
            Detach
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
