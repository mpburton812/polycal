"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
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
  CircularProgress,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  acknowledgeProposalOverlapAction,
  addProposalCommentAction,
  cancelProposalAction,
  castProposalVoteAction,
  castSlotVoteAction,
  cloneProposalAction,
  deleteDraftProposalAction,
  getProposalDetailAction,
  redraftProposalAction,
  rescheduleProposalAction,
  revokeResolvedAcceptanceAction,
  submitProposalAction,
  updateResolvedAttendeesAction,
  type ProposalConflictWarning,
  type ProposalDetail,
} from "@/actions/proposals";
import { BatchNightsSummary } from "./BatchNightsSummary";
import { useToast } from "@/components/providers/ToastProvider";
import type { InviteeVoteStatus } from "@/lib/db/schema";
import type { PersonSummary } from "@/actions/users";
import { handleCommentEnterKey } from "@/lib/ui/comment-keydown";

import {
  formatTimeRange,
  POLY_GREEN,
  primaryButtonSx,
  proposalCardSx,
  typeBadgeLabel,
  typeChipSxForProposal,
} from "./proposalCardTheme";
import { ProposalEventIcon } from "./ProposalEventIcon";
import { ProposalScheduleField } from "./ProposalScheduleFields";
import { formatProposalLogLine } from "@/lib/proposals/state-log-format";
import {
  inviteeDisplayLabel,
  inviteeVoteLabel,
} from "@/lib/proposals/invitee-display-status";
import { isoToSleepingDateInput, sleepingDateToStartIso } from "@/lib/proposals/sleeping-schedule";
import { GARDEN_TOKENS } from "@/theme/tokens";

/** Readable poll slot label + time on separate lines (PC-49). */
function PollSlotTimeCell({
  label,
  startAt,
  endAt,
}: {
  label: string | null;
  startAt: string;
  endAt: string | null;
}) {
  const time = formatTimeRange(startAt, endAt);
  return (
    <Stack spacing={0.25} sx={{ minWidth: 168 }}>
      {label && (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
      )}
      {time && (
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {time}
        </Typography>
      )}
    </Stack>
  );
}

const SLOT_VOTE_LABELS: Record<"accept" | "accept_suboptimal" | "decline", string> = {
  accept: "Accept",
  accept_suboptimal: "Sub-opt",
  decline: "Decline",
};

const SLOT_VOTE_OPTIONS = ["accept", "accept_suboptimal", "decline"] as const;

interface ProposalDetailDialogProps {
  proposalId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit: (detail: ProposalDetail) => void;
  people?: PersonSummary[];
  onOpenRelatedProposal?: (proposalId: string) => void;
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
  onOpenRelatedProposal,
}: ProposalDetailDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [commentText, setCommentText] = useState("");
  const [conflictWarnings, setConflictWarnings] = useState<ProposalConflictWarning[]>([]);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  const [addAttendeeId, setAddAttendeeId] = useState("");
  const [addAttendeeRole, setAddAttendeeRole] = useState<"required" | "optional">("required");
  const [cancelScopeOpen, setCancelScopeOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");
  const [pending, startTransition] = useTransition();
  /** True while the initial detail fetch for the open dialog is in flight (PC-138). */
  const [detailLoading, setDetailLoading] = useState(false);

  function notifyResult(result: { ok: boolean; message: string }) {
    showToast(result.message, result.ok ? "success" : "error");
  }

  function reloadDetail(id: string, options?: { isInitial?: boolean }) {
    if (options?.isInitial) {
      setDetailLoading(true);
    }
    startTransition(async () => {
      try {
        const result = await getProposalDetailAction(id);
        if (!result.ok || !result.detail) {
          // The proposal may have left the viewer's scope after their own action
          // (e.g. a decline that reverts it to a draft only the proposer can see).
          // Clear the detail silently so a reload error doesn't clobber the
          // action's own success toast (fixes a flaky "Vote recorded" assertion).
          setDetail(null);
          return;
        }
        setDetail(result.detail);
      } finally {
        if (options?.isInitial) {
          setDetailLoading(false);
        }
      }
    });
  }

  useEffect(() => {
    if (!open || !proposalId) {
      setDetail(null);
      setDetailLoading(false);
      setCommentText("");
      setConflictWarnings([]);
      setShowConflictConfirm(false);
      return;
    }
    setDetail(null);
    reloadDetail(proposalId, { isInitial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when proposal changes
  }, [open, proposalId]);

  function handleOverlapResponse(response: "acknowledge" | "decline") {
    if (!proposalId) return;
    startTransition(async () => {
      const result = await acknowledgeProposalOverlapAction({ proposalId, response });
      notifyResult(result);
      if (!result.ok) return;
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  function handleVote(vote: "accept" | "abstain" | "decline" | "accept_suboptimal") {
    if (!proposalId) return;
    startTransition(async () => {
      const result = await castProposalVoteAction({ proposalId, vote });
      notifyResult(result);
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
    startTransition(async () => {
      const result = await castSlotVoteAction({ proposalId, timeSlotId, vote });
      notifyResult(result);
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
        notifyResult(result);
        return;
      }
      notifyResult(result);
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!proposalId || !window.confirm("Delete this draft?")) return;
    startTransition(async () => {
      const result = await deleteDraftProposalAction(proposalId);
      notifyResult(result);
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  function handleCancel(scope: "occurrence" | "series" = "occurrence") {
    if (!proposalId) return;
    startTransition(async () => {
      const result = await cancelProposalAction(proposalId, scope);
      notifyResult(result);
      setCancelScopeOpen(false);
      if (!result.ok) return;
      onClose();
      router.refresh();
    });
  }

  function handleCancelClick() {
    if (!detail) return;
    if (detail.isRecurring) {
      setCancelScopeOpen(true);
      return;
    }
    if (!window.confirm("Cancel this proposal? It will be archived.")) return;
    handleCancel("occurrence");
  }

  function handleClone() {
    if (!proposalId) return;
    startTransition(async () => {
      const result = await cloneProposalAction(proposalId);
      notifyResult(result);
      if (!result.ok || !result.newProposalId) return;
      const detailResult = await getProposalDetailAction(result.newProposalId);
      if (detailResult.ok && detailResult.detail) {
        onClose();
        onEdit(detailResult.detail);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function handleRevokeAcceptance() {
    if (!proposalId || !window.confirm("Revoke your acceptance? The event will be flagged at risk.")) {
      return;
    }
    startTransition(async () => {
      const result = await revokeResolvedAcceptanceAction(proposalId);
      notifyResult(result);
      if (!result.ok) return;
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  function openRescheduleDialog() {
    if (!detail?.scheduledStartAt) return;
    if (detail.proposalType === "sleeping") {
      setRescheduleStart(isoToSleepingDateInput(detail.scheduledStartAt));
      setRescheduleEnd(
        detail.scheduledEndAt
          ? isoToSleepingDateInput(detail.scheduledEndAt)
          : isoToSleepingDateInput(detail.scheduledStartAt),
      );
    } else {
      const start = new Date(detail.scheduledStartAt);
      const end = detail.scheduledEndAt ? new Date(detail.scheduledEndAt) : start;
      const toLocal = (date: Date) => {
        const offset = date.getTimezoneOffset();
        const local = new Date(date.getTime() - offset * 60_000);
        return local.toISOString().slice(0, 16);
      };
      setRescheduleStart(toLocal(start));
      setRescheduleEnd(toLocal(end));
    }
    setRescheduleOpen(true);
  }

  function handleReschedule() {
    if (!proposalId || !rescheduleStart || !detail) return;
    startTransition(async () => {
      const scheduledStartAt =
        detail.proposalType === "sleeping"
          ? (sleepingDateToStartIso(rescheduleStart) ?? "")
          : new Date(rescheduleStart).toISOString();
      const scheduledEndAt =
        detail.proposalType === "sleeping"
          ? rescheduleEnd && rescheduleEnd !== rescheduleStart
            ? sleepingDateToStartIso(rescheduleEnd)
            : undefined
          : rescheduleEnd
            ? new Date(rescheduleEnd).toISOString()
            : undefined;

      const result = await rescheduleProposalAction({
        proposalId,
        scheduledStartAt,
        scheduledEndAt,
      });
      notifyResult(result);
      if (!result.ok) return;
      setRescheduleOpen(false);
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
      notifyResult(result);
      if (!result.ok) return;
      const detailResult = await getProposalDetailAction(proposalId);
      if (detailResult.ok && detailResult.detail) {
        onEdit(detailResult.detail);
        return;
      }
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  function handleAddComment() {
    if (!proposalId || !commentText.trim()) return;
    startTransition(async () => {
      const result = await addProposalCommentAction({
        proposalId,
        body: commentText.trim(),
      });
      notifyResult(result);
      if (!result.ok) return;
      setCommentText("");
      reloadDetail(proposalId);
    });
  }

  function handleAddAttendee() {
    if (!proposalId || !addAttendeeId.trim()) return;
    startTransition(async () => {
      const result = await updateResolvedAttendeesAction({
        proposalId,
        ...(addAttendeeRole === "required"
          ? { addRequired: [addAttendeeId.trim()] }
          : { addOptional: [addAttendeeId.trim()] }),
      });
      notifyResult(result);
      if (!result.ok) return;
      setAddAttendeeId("");
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  function handleRemoveAttendee(userId: string) {
    if (!proposalId) return;
    startTransition(async () => {
      const result = await updateResolvedAttendeesAction({
        proposalId,
        removeUserIds: [userId],
      });
      notifyResult(result);
      if (!result.ok) return;
      reloadDetail(proposalId);
      router.refresh();
    });
  }

  const whenLabel = detail
    ? formatTimeRange(
        detail.scheduledStartAt,
        detail.scheduledEndAt,
        detail.proposalType,
        detail.isAllDay,
      ) ??
      (detail.timeSlots[0]
        ? formatTimeRange(
            detail.timeSlots[0].startAt,
            detail.timeSlots[0].endAt,
            detail.proposalType,
            detail.isAllDay,
          )
        : null)
    : null;

  const isPollMatrix = detail?.isPoll && (detail.timeSlots.length ?? 0) > 1;

  return (
    <>
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { bgcolor: "transparent", boxShadow: "none", overflow: "visible" } }}
    >
      <Card
        variant="outlined"
        sx={{
          ...proposalCardSx,
          bgcolor: GARDEN_TOKENS.surface,
          maxHeight: "min(90vh, 900px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <CardContent sx={{ pb: 1, overflowY: "auto", flex: 1 }}>
          {detail?.optionalPollPending && (
            <Alert severity="success" sx={{ mb: 2 }}>
              This proposal was approved by all required attendees and scheduled. Please complete
              your poll votes below.
            </Alert>
          )}
          {detail?.atRisk && detail.state === "resolved" && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This event is at risk on the calendar. Cancel, re-draft, or update attendees to resolve.
              {(detail.canCancel || detail.canRedraft || detail.canManageAttendees) && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                  {detail.canCancel && (
                    <Button size="small" color="error" onClick={handleCancelClick} disabled={pending}>
                      Cancel event
                    </Button>
                  )}
                  {detail.canRedraft && (
                    <Button size="small" onClick={handleRedraft} disabled={pending}>
                      Re-draft
                    </Button>
                  )}
                  {detail.canManageAttendees && (
                    <Typography variant="caption" sx={{ alignSelf: "center" }}>
                      Use attendee controls below to modify invitees.
                    </Typography>
                  )}
                </Stack>
              )}
            </Alert>
          )}
          {detail?.isContentMasked && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This is a private event. Details are hidden because you are not an invitee.
            </Alert>
          )}
          {detail?.hasOverlapWarning && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Your calendar now conflicts with this event after you voted. Review your schedule.
              {detail.canAcknowledgeOverlap && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    sx={primaryButtonSx}
                    onClick={() => handleOverlapResponse("acknowledge")}
                    disabled={pending}
                  >
                    Acknowledge
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => handleOverlapResponse("decline")}
                    disabled={pending}
                  >
                    Decline
                  </Button>
                </Stack>
              )}
            </Alert>
          )}
          {showConflictConfirm && conflictWarnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Schedule conflicts
              </Typography>
              {conflictWarnings.map((w, i) => (
                <Typography key={`${w.userId}-${i}`} variant="body2">
                  {w.conflictKind === "place_asset" ? "Place" : w.displayName} overlaps with
                  &quot;{w.conflictingTitle}&quot; ({w.conflictingState})
                </Typography>
              ))}
              <Button
                size="small"
                variant="contained"
                sx={{ mt: 1, ...primaryButtonSx }}
                onClick={() => handleSubmit(true)}
                disabled={pending}
              >
                Submit anyway
              </Button>
            </Alert>
          )}

          {detail?.parentProposalId && (
            <Alert
              severity="info"
              sx={{ mb: 2 }}
              action={
                onOpenRelatedProposal ? (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => onOpenRelatedProposal(detail.parentProposalId!)}
                  >
                    View series
                  </Button>
                ) : undefined
              }
            >
              This occurrence is part of a recurring series.
            </Alert>
          )}
          {detail?.isRecurrenceParent && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Recurring series parent — open individual occurrences on the schedule to vote per date.
            </Alert>
          )}
          {detailLoading && !detail && (
            <Stack spacing={1.5} aria-busy="true" aria-label="Loading proposal">
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={22} aria-hidden />
                <Typography variant="body2" color="text.secondary">
                  Loading proposal…
                </Typography>
              </Stack>
              <Skeleton variant="text" width="70%" height={32} />
              <Skeleton variant="rounded" height={20} width="40%" />
              <Skeleton variant="rounded" height={72} />
              <Skeleton variant="rounded" height={48} />
              <Skeleton variant="rounded" height={96} />
            </Stack>
          )}
          {!detailLoading && !detail && (
            <Typography variant="body2" color="text.secondary">
              This proposal is no longer available.
            </Typography>
          )}
          {detail && (
            <>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                <ProposalEventIcon
                  eventIconKey={detail.eventIconKey}
                  isContentMasked={detail.isContentMasked}
                  proposalType={detail.proposalType}
                  size={22}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6" component="h2" sx={{ fontSize: "1.1rem", fontWeight: 600 }}>
                    {detail.title}
                  </Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                    <Chip
                      label={typeBadgeLabel(detail.proposalType)}
                      size="small"
                      sx={{
                        ...typeChipSxForProposal(detail.proposalType),
                        height: 20,
                        fontSize: "0.6rem",
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      by {detail.proposerName}
                    </Typography>
                  </Stack>
                </Box>
              </Stack>

              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                <Chip
                  label={detail.displayState.toUpperCase()}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: "0.65rem" }}
                />
                {detail.atRisk && <Chip size="small" label="At risk" color="warning" />}
                {detail.isPoll && (
                  <Chip
                    icon={<PollOutlinedIcon sx={{ fontSize: "14px !important" }} />}
                    label="Poll"
                    size="small"
                    variant="outlined"
                  />
                )}
                {detail.isBatchSleeping && (
                  <Chip size="small" label="Batch" variant="outlined" />
                )}
                {detail.isRecurring && <Chip size="small" label="Recurring" variant="outlined" />}
                {(detail.eventPrivacy === "private" || detail.eventPrivacy === "super_private") && (
                  <Chip size="small" label="Private" variant="outlined" />
                )}
                {detail.isPoll && detail.winningSlotId && (
                  <Chip size="small" label="Winning slot" sx={{ bgcolor: POLY_GREEN, color: "#fff" }} />
                )}
              </Stack>

              {!detail.isContentMasked && detail.description && (
                <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mb: 1 }}>
                  <EventNoteOutlinedIcon sx={{ fontSize: 18, color: "text.secondary", mt: 0.25 }} />
                  <Typography variant="body2">{detail.description}</Typography>
                </Stack>
              )}

              {!detail.isContentMasked && <BatchNightsSummary detail={detail} />}

              {whenLabel && (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                  <AccessTimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="body2" color="text.secondary">{whenLabel}</Typography>
                </Stack>
              )}

              {(detail.locationName || detail.bedroomLabel) && (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                  <LocationOnOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="body2" color="text.secondary">
                    {[detail.locationName, detail.bedroomLabel].filter(Boolean).join(" · ")}
                  </Typography>
                </Stack>
              )}

              {detail.notes && (
                <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 1 }}>
                  <NotesOutlinedIcon sx={{ fontSize: 16, color: "text.secondary", mt: 0.25 }} />
                  <Typography variant="body2" color="text.secondary">{detail.notes}</Typography>
                </Stack>
              )}

              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                <Chip size="small" label={detail.eventPrivacy} variant="outlined" />
              </Stack>

              {isPollMatrix && (
                <>
                  <Typography variant="subtitle2">Poll matrix</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Vote for each time slot. Required invitees must complete all rows before resolution.
                  </Typography>
                  <Box sx={{ overflowX: "auto", mt: 1 }}>
                    <Table size="small" sx={{ minWidth: 520 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ minWidth: 180 }}>Time slot</TableCell>
                          <TableCell align="center" sx={{ minWidth: 52, px: 0.5 }}>
                            Accept
                          </TableCell>
                          <TableCell align="center" sx={{ minWidth: 64, px: 0.5 }}>
                            Sub-opt.
                          </TableCell>
                          <TableCell align="center" sx={{ minWidth: 64, px: 0.5 }}>
                            Decline
                          </TableCell>
                          <TableCell sx={{ minWidth: 100 }}>Your vote</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.timeSlots.map((slot) => {
                          const viewerVote = detail.viewerSlotVotes[slot.id] as
                            | InviteeVoteStatus
                            | undefined;
                          const canVoteRow = detail.canVoteSlots;
                          return (
                            <TableRow
                              key={slot.id}
                              sx={
                                detail.winningSlotId === slot.id ? { bgcolor: "#e8f5e9" } : undefined
                              }
                            >
                              <TableCell sx={{ verticalAlign: "top" }}>
                                <PollSlotTimeCell
                                  label={slot.label}
                                  startAt={slot.startAt}
                                  endAt={slot.endAt}
                                />
                              </TableCell>
                              {SLOT_VOTE_OPTIONS.map((vote) => (
                                  <TableCell key={vote} align="center" sx={{ px: 0.5 }}>
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
                                        aria-label={`${SLOT_VOTE_LABELS[vote]} for ${slot.label ?? formatTimeRange(slot.startAt, slot.endAt)}`}
                                        onClick={() => handleSlotVote(slot.id, vote)}
                                        sx={{
                                          minWidth: 52,
                                          px: 0.75,
                                          fontSize: "0.7rem",
                                          ...(viewerVote === vote && vote === "accept"
                                            ? { bgcolor: POLY_GREEN }
                                            : undefined),
                                        }}
                                      >
                                        {SLOT_VOTE_LABELS[vote]}
                                      </Button>
                                    )}
                                  </TableCell>
                                ))}
                              <TableCell sx={{ verticalAlign: "top" }}>
                                <Chip
                                  size="small"
                                  label={viewerVote ? inviteeVoteLabel(viewerVote) : "—"}
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
                    <Box sx={{ overflowX: "auto", mt: 2 }}>
                      <Typography variant="subtitle2">All responses</Typography>
                      <Table size="small" sx={{ minWidth: 400, mt: 0.5 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ minWidth: 120 }}>Invitee</TableCell>
                            {detail.timeSlots.map((slot) => (
                              <TableCell key={slot.id} sx={{ minWidth: 120, verticalAlign: "top" }}>
                                <PollSlotTimeCell
                                  label={slot.label}
                                  startAt={slot.startAt}
                                  endAt={slot.endAt}
                                />
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
                                    {vote ? inviteeVoteLabel(vote.voteStatus) : "—"}
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
                      <Chip
                        size="small"
                        label={inviteeDisplayLabel(invitee.voteStatus, invitee.viewedAt)}
                      />
                      {detail.canManageAttendees && (
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleRemoveAttendee(invitee.userId)}
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
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <FormControl size="small" sx={{ flex: 1, minWidth: 160 }}>
                    <InputLabel id="add-attendee-label">Add attendee</InputLabel>
                    <Select
                      labelId="add-attendee-label"
                      label="Add attendee"
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
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="add-attendee-role-label">Role</InputLabel>
                    <Select
                      labelId="add-attendee-role-label"
                      label="Role"
                      value={addAttendeeRole}
                      onChange={(e) =>
                        setAddAttendeeRole(e.target.value as "required" | "optional")
                      }
                    >
                      <MenuItem value="required">Required</MenuItem>
                      <MenuItem value="optional">Optional</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={pending || !addAttendeeId}
                    onClick={handleAddAttendee}
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
              {detail.canRevokeAcceptance && (
                <Button
                  variant="outlined"
                  color="error"
                  disabled={pending}
                  onClick={handleRevokeAcceptance}
                >
                  Revoke acceptance
                </Button>
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
                      multiline
                      minRows={1}
                      maxRows={4}
                      placeholder="Add a comment…"
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      onKeyDown={(event) =>
                        handleCommentEnterKey(
                          event,
                          handleAddComment,
                          Boolean(commentText.trim()) && !pending,
                        )
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
                </>
              )}
              {detail.stateLog.length > 0 && (
                <>
                  <Divider />
                  <Typography variant="subtitle2">Activity log</Typography>
                  <Stack spacing={0.5}>
                    {detail.stateLog.map((entry, index) => (
                      <Typography key={`${entry.createdAt}-${index}`} variant="caption" color="text.secondary">
                        {formatProposalLogLine(entry)}
                      </Typography>
                    ))}
                  </Stack>
                </>
              )}
            </>
          )}
        </CardContent>
        {/* Close stays available once the initial fetch settles (success or miss) so
            post-vote reloads that clear detail cannot trap the user (PC-138). */}
        {(!detailLoading || detail) && (
          <CardActions sx={{ px: 2, pb: 2, pt: 0, flexWrap: "wrap", gap: 1 }}>
            {detail?.canCancel && (
              <Button color="error" onClick={handleCancelClick} disabled={pending}>
                Cancel
              </Button>
            )}
            {detail?.canClone && (
              <Button onClick={handleClone} disabled={pending}>
                Clone
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
                  sx={primaryButtonSx}
                >
                  Submit
                </Button>
              </>
            )}
            {detail?.canReschedule && (
              <Button onClick={openRescheduleDialog} disabled={pending}>
                Reschedule
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </CardActions>
        )}
      </Card>
    </Dialog>
    <Dialog open={cancelScopeOpen} onClose={() => setCancelScopeOpen(false)}>
      <DialogTitle>Cancel recurring proposal</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Apply cancellation to this occurrence only, or the entire series?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCancelScopeOpen(false)}>Back</Button>
        <Button color="error" onClick={() => handleCancel("occurrence")} disabled={pending}>
          This occurrence only
        </Button>
        <Button color="error" variant="contained" onClick={() => handleCancel("series")} disabled={pending}>
          Entire series
        </Button>
      </DialogActions>
    </Dialog>
    <Dialog open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>
        {detail?.proposalType === "sleeping" ? "Reschedule sleeping dates" : "Reschedule event"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <ProposalScheduleField
            label={detail?.proposalType === "sleeping" ? "Night of" : "Start"}
            mode={detail?.proposalType === "sleeping" ? "date" : "datetime"}
            splitDateTime={detail?.proposalType === "event"}
            value={rescheduleStart}
            onChange={setRescheduleStart}
            timeHelperText={
              detail?.proposalType === "event" ? "End defaults to one hour after start when empty" : undefined
            }
          />
          <ProposalScheduleField
            label={
              detail?.proposalType === "sleeping" ? "Last night (optional)" : "End (optional)"
            }
            mode={detail?.proposalType === "sleeping" ? "date" : "datetime"}
            splitDateTime={detail?.proposalType === "event"}
            value={rescheduleEnd}
            onChange={setRescheduleEnd}
            disabled={!rescheduleStart}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setRescheduleOpen(false)}>Cancel</Button>
        <Button variant="contained" onClick={handleReschedule} disabled={pending || !rescheduleStart}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}

function BoxComment({
  comment,
}: {
  comment: { authorName: string; body: string; createdAt: string; sliceTag?: string | null };
}) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {comment.authorName} · {new Date(comment.createdAt).toLocaleString()}
        {comment.sliceTag ? ` · ${comment.sliceTag}` : ""}
      </Typography>
      <Typography variant="body2">{comment.body}</Typography>
    </Stack>
  );
}
