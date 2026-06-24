"use client";

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
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  addProposalCommentAction,
  cancelProposalAction,
  castProposalVoteAction,
  castSlotVoteAction,
  deleteDraftProposalAction,
  getProposalDetailAction,
  redraftProposalAction,
  submitProposalAction,
  updateResolvedAttendeesAction,
  type ProposalConflictWarning,
  type ProposalDetail,
} from "@/actions/proposals";
import type { InviteeVoteStatus } from "@/lib/db/schema";
import type { PersonSummary } from "@/actions/users";

const POLY_GREEN = "#004d40";

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
  people?: PersonSummary[];
}

/**
 * Proposal detail with matrix poll voting, conflict checks, and lifecycle actions (PC-40).
 */
export function ProposalDetailDialog({
  proposalId,
  open,
  onClose,
  onEdit,
  people = [],
}: ProposalDetailDialogProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [conflictWarnings, setConflictWarnings] = useState<ProposalConflictWarning[]>([]);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  const [addAttendeeId, setAddAttendeeId] = useState("");
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
      setConflictWarnings([]);
      setShowConflictConfirm(false);
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

  function handleSlotVote(
    timeSlotId: string,
    vote: "accept" | "abstain" | "decline" | "accept_suboptimal",
  ) {
    if (!proposalId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await castSlotVoteAction({ proposalId, timeSlotId, vote });
      setMessage(result.message);
      if (!result.ok) return;
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  function handleSubmit(confirm = false) {
    if (!proposalId) return;
    startTransition(async () => {
      const result = await submitProposalAction(proposalId, confirm);
      if (!result.ok && result.warnings && result.warnings.length > 0) {
        setConflictWarnings(result.warnings);
        setShowConflictConfirm(true);
        setMessage(result.message);
        return;
      }
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

  function handleAddOptionalAttendee() {
    if (!proposalId || !addAttendeeId.trim()) return;
    startTransition(async () => {
      const result = await updateResolvedAttendeesAction({
        proposalId,
        addOptional: [addAttendeeId.trim()],
      });
      setMessage(result.message);
      if (!result.ok) return;
      setAddAttendeeId("");
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  function handleRemoveOptionalAttendee(userId: string) {
    if (!proposalId) return;
    startTransition(async () => {
      const result = await updateResolvedAttendeesAction({
        proposalId,
        removeUserIds: [userId],
      });
      setMessage(result.message);
      if (!result.ok) return;
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  const whenLabel = detail
    ? formatWhen(detail.scheduledStartAt, detail.scheduledEndAt) ??
      (detail.timeSlots[0]
        ? formatWhen(detail.timeSlots[0].startAt, detail.timeSlots[0].endAt)
        : null)
    : null;

  const isPollMatrix = detail?.isPoll && (detail.timeSlots.length ?? 0) > 1;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{detail?.title ?? "Proposal"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {message && <Alert severity="info">{message}</Alert>}
          {showConflictConfirm && conflictWarnings.length > 0 && (
            <Alert severity="warning">
              <Typography variant="subtitle2" gutterBottom>
                Schedule conflicts
              </Typography>
              {conflictWarnings.map((w, i) => (
                <Typography key={`${w.userId}-${i}`} variant="body2">
                  {w.displayName} overlaps with &quot;{w.conflictingTitle}&quot; (
                  {w.conflictingState})
                </Typography>
              ))}
              <Button
                size="small"
                variant="contained"
                sx={{ mt: 1, bgcolor: POLY_GREEN }}
                onClick={() => handleSubmit(true)}
                disabled={pending}
              >
                Submit anyway
              </Button>
            </Alert>
          )}
          {detail && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip size="small" label={detail.proposalType} />
                <Chip size="small" label={detail.state} variant="outlined" />
                <Chip size="small" label={detail.eventPrivacy} variant="outlined" />
                {detail.isPoll && <Chip size="small" label="Poll" color="info" />}
                {detail.atRisk && <Chip size="small" label="At risk" color="warning" />}
                {detail.winningSlotId && (
                  <Chip size="small" label="Winning slot chosen" sx={{ bgcolor: POLY_GREEN, color: "#fff" }} />
                )}
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

              {isPollMatrix && (
                <>
                  <Typography variant="subtitle2">Poll matrix</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Vote for each time slot. Required invitees must complete all rows before resolution.
                  </Typography>
                  <Box sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Time slot</TableCell>
                          <TableCell align="center">Accept</TableCell>
                          <TableCell align="center">Sub-optimal</TableCell>
                          <TableCell align="center">Abstain</TableCell>
                          <TableCell align="center">Decline</TableCell>
                          <TableCell>Your vote</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.timeSlots.map((slot) => {
                          const viewerVote = detail.viewerSlotVotes[slot.id] as
                            | InviteeVoteStatus
                            | undefined;
                          const canVoteRow = detail.canVoteSlots;
                          return (
                            <TableRow key={slot.id} sx={detail.winningSlotId === slot.id ? { bgcolor: "#e8f5e9" } : undefined}>
                              <TableCell>
                                {slot.label ? `${slot.label}: ` : ""}
                                {formatWhen(slot.startAt, slot.endAt)}
                              </TableCell>
                              {(["accept", "accept_suboptimal", "abstain", "decline"] as const).map(
                                (vote) => (
                                  <TableCell key={vote} align="center">
                                    {canVoteRow && (
                                      <Button
                                        size="small"
                                        variant={viewerVote === vote ? "contained" : "outlined"}
                                        color={
                                          vote === "accept"
                                            ? "success"
                                            : vote === "decline"
                                              ? "error"
                                              : "inherit"
                                        }
                                        disabled={pending}
                                        onClick={() => handleSlotVote(slot.id, vote)}
                                        sx={
                                          viewerVote === vote && vote === "accept"
                                            ? { bgcolor: POLY_GREEN }
                                            : undefined
                                        }
                                      >
                                        ·
                                      </Button>
                                    )}
                                  </TableCell>
                                ),
                              )}
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={viewerVote ? voteLabel(viewerVote) : "—"}
                                  variant="outlined"
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>

                  {detail.slotVotes.length > 0 && (
                    <Box sx={{ overflowX: "auto" }}>
                      <Typography variant="subtitle2" sx={{ mt: 1 }}>
                        All responses
                      </Typography>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Invitee</TableCell>
                            {detail.timeSlots.map((slot) => (
                              <TableCell key={slot.id}>
                                {slot.label ?? new Date(slot.startAt).toLocaleDateString()}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {detail.invitees.map((invitee) => (
                            <TableRow key={invitee.userId}>
                              <TableCell>{invitee.displayName}</TableCell>
                              {detail.timeSlots.map((slot) => {
                                const vote = detail.slotVotes.find(
                                  (v) =>
                                    v.userId === invitee.userId && v.timeSlotId === slot.id,
                                );
                                return (
                                  <TableCell key={slot.id}>
                                    {vote ? voteLabel(vote.voteStatus) : "—"}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  )}
                </>
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
                      {detail.canManageAttendees && invitee.role === "optional" && (
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleRemoveOptionalAttendee(invitee.userId)}
                          disabled={pending}
                        >
                          Remove
                        </Button>
                      )}
                    </Stack>
                  ))}
                </Stack>
              )}

              {detail.canManageAttendees && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel id="add-attendee-label">Add optional attendee</InputLabel>
                    <Select
                      labelId="add-attendee-label"
                      label="Add optional attendee"
                      value={addAttendeeId}
                      onChange={(e) => setAddAttendeeId(e.target.value)}
                    >
                      <MenuItem value="">Select person</MenuItem>
                      {people
                        .filter(
                          (p) =>
                            !detail.invitees.some((inv) => inv.userId === p.id) &&
                            p.id !== detail.proposerId,
                        )
                        .map((person) => (
                          <MenuItem key={person.id} value={person.id}>
                            {person.displayName}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={pending || !addAttendeeId}
                    onClick={handleAddOptionalAttendee}
                  >
                    Add
                  </Button>
                </Stack>
              )}

              {detail.canVote && (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    variant="contained"
                    color="success"
                    disabled={pending}
                    onClick={() => handleVote("accept")}
                    sx={{ bgcolor: POLY_GREEN }}
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
            <Button
              variant="contained"
              onClick={() => handleSubmit(false)}
              disabled={pending}
              sx={{ bgcolor: POLY_GREEN }}
            >
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
