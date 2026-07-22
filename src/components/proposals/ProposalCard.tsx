"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";

import { type ProposalCard as ProposalCardData } from "@/actions/proposals";
import { MASKED_TITLE } from "@/lib/proposals/access";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

import {
  brutalPressSx,
  formatTimeRange,
  isAdminOversightView,
  ADMIN_OVERSIGHT_BG,
  primaryButtonSx,
  proposalCardRotation,
  proposalCardSx,
  typeBadgeLabel,
  typeChipSxForProposal,
} from "./proposalCardTheme";
import { ProposalEventIcon } from "./ProposalEventIcon";
import { ProposalExpiryCountdown } from "./ProposalExpiryCountdown";

const NUDGE_COOLDOWN_MS = 60 * 60 * 1000;

function nudgeOnCooldown(lastNudgeAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastNudgeAt) return false;
  const lastMs = Date.parse(lastNudgeAt);
  return !Number.isNaN(lastMs) && nowMs - lastMs < NUDGE_COOLDOWN_MS;
}
function stateBadgeLabel(proposal: ProposalCardData): string {
  if (proposal.workflowStatus === "declined") return "DECLINED";
  return proposal.state.toUpperCase();
}

function responseLabel(proposal: ProposalCardData): string {
  if (proposal.inviteeCount === 0) return "No invitees";
  if (proposal.respondedCount === 0) return "No responses yet";
  return `${proposal.respondedCount} of ${proposal.inviteeCount} responded`;
}

/**
 * Picks one emphasis status chip so the card answers "do I act?" without a chip pile (PC-124).
 */
function emphasisStatus(proposal: ProposalCardData): {
  label: string;
  sx: Record<string, unknown>;
} | null {
  if (proposal.needsViewerAction) {
    return {
      label: "Action needed",
      sx: {
        bgcolor: GARDEN_TOKENS.sage,
        color: GARDEN_TOKENS.surface,
        border: `2px solid ${GARDEN_TOKENS.ink}`,
      },
    };
  }
  if (proposal.atRisk) {
    return {
      label: "At risk",
      sx: {
        bgcolor: "#F0C878",
        color: GARDEN_TOKENS.ink,
        border: `2px solid ${GARDEN_TOKENS.ink}`,
      },
    };
  }
  if (proposal.notOnCalendar) {
    return {
      label: "Not on calendar",
      sx: {
        borderColor: GARDEN_TOKENS.ink,
        color: GARDEN_TOKENS.ink,
      },
    };
  }
  return {
    label: stateBadgeLabel(proposal),
    sx: {
      fontWeight: 600,
      fontSize: "0.65rem",
      borderColor: GARDEN_TOKENS.ink,
      color: GARDEN_TOKENS.ink,
    },
  };
}

interface ProposalCardProps {
  proposal: ProposalCardData;
  onOpen: (id: string) => void;
  onContinueEdit?: (id: string) => void;
  onDeleteDraft?: (id: string) => void;
  onNudge?: (id: string) => void;
  onAdminDelete?: (id: string) => void;
  nudgePending?: boolean;
  /** App admin viewer — used for oversight chrome (PC-196). */
  isAdmin?: boolean;
  currentUserId?: string;
}

/**
 * Proposal card with Garden Brutalism ink borders — scan order what → when → where → act (PC-124).
 */
export function ProposalCard({
  proposal,
  onOpen,
  onContinueEdit,
  onDeleteDraft,
  onNudge,
  onAdminDelete,
  nudgePending = false,
  isAdmin = false,
  currentUserId = "",
}: ProposalCardProps) {
  const timeLabel = formatTimeRange(
    proposal.scheduledStartAt,
    proposal.scheduledEndAt,
    proposal.proposalType,
    proposal.isAllDay,
  );
  const responsePct =
    proposal.inviteeCount > 0
      ? Math.round((proposal.respondedCount / proposal.inviteeCount) * 100)
      : 0;
  const rotation = proposalCardRotation(proposal.id);
  const status = emphasisStatus(proposal);
  const locationLine =
    proposal.locationName && proposal.bedroomLabel
      ? `${proposal.locationName} · ${proposal.bedroomLabel}`
      : proposal.locationName;
  const adminOversight = isAdminOversightView(
    isAdmin,
    currentUserId,
    proposal.proposerId,
    Boolean(proposal.viewerIsInvitee),
  );

  const sparseBadges: string[] = [];
  if (!proposal.isContentMasked) {
    if (proposal.proposalType === "event" && proposal.isPoll) sparseBadges.push("Poll");
    if (proposal.proposalType === "sleeping" && proposal.isBatchSleeping) {
      sparseBadges.push("Batch");
    }
    // Keep At risk visible when Action needed is the emphasis chip (PC-124).
    if (proposal.atRisk && status?.label !== "At risk") sparseBadges.push("At risk");
    if (proposal.isRecurring) sparseBadges.push("Recurring");
    if (proposal.isPastSchedule) sparseBadges.push("Past");
  } else {
    sparseBadges.push(MASKED_TITLE);
  }

  const typeAccent =
    proposal.proposalType === "sleeping" &&
    proposal.cardKind !== "partnership" &&
    proposal.specialKind !== "residency" &&
    proposal.cardKind !== "residency"
      ? "#C4B5E8"
      : "#F5D76E";

  return (
    <Card
      variant="outlined"
      sx={{
        ...proposalCardSx,
        ...brutalPressSx,
        ...(adminOversight ? { bgcolor: ADMIN_OVERSIGHT_BG } : {}),
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transform: `rotate(${rotation})`,
        borderLeft: `6px solid ${typeAccent}`,
        "&:hover": {
          ...brutalPressSx["&:hover"],
          transform: `rotate(${rotation}) translate(1px, 1px)`,
        },
      }}
      onClick={() => onOpen(proposal.id)}
    >
      {!proposal.isContentMasked &&
        proposal.proposalType === "event" &&
        proposal.eventIconKey && (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "42%",
              display: "flex",
              alignItems: "stretch",
              justifyContent: "flex-end",
              pointerEvents: "none",
              opacity: 0.3,
              color: GARDEN_TOKENS.ink,
              zIndex: 0,
            }}
          >
            <ProposalEventIcon
              eventIconKey={proposal.eventIconKey}
              isContentMasked={false}
              proposalType={proposal.proposalType}
              fillHeight
            />
          </Box>
        )}
      <CardContent sx={{ pb: 1, position: "relative", zIndex: 1 }}>
        {proposal.cardKind === "partnership" && (
          <Typography
            variant="caption"
            sx={{ display: "block", mb: 0.5, color: GARDEN_TOKENS.inkMuted }}
          >
            Visible only to proposer, invitee, and admins.
          </Typography>
        )}
        {(proposal.specialKind === "residency" || proposal.cardKind === "residency") && (
          <Typography
            variant="caption"
            sx={{ display: "block", mb: 0.5, color: GARDEN_TOKENS.inkMuted }}
          >
            Place residency — no date or time required.
          </Typography>
        )}
        {/* What */}
        <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ mb: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h6"
              component="h2"
              sx={{
                fontFamily: fontFamilies.label,
                fontSize: "1.1rem",
                fontWeight: 600,
                lineHeight: 1.25,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {proposal.title}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
              <Chip
                label={typeBadgeLabel(proposal.proposalType, proposal.cardKind, proposal.specialKind)}
                size="small"
                sx={{
                  ...typeChipSxForProposal(
                    proposal.proposalType,
                    proposal.cardKind,
                    proposal.specialKind,
                  ),
                  height: 20,
                  fontSize: "0.6rem",
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  fontFamily: fontFamilies.label,
                  color: GARDEN_TOKENS.inkMuted,
                  fontSize: "0.65rem",
                }}
              >
                by {proposal.proposerName}
              </Typography>
            </Stack>
          </Box>
          {proposal.canNudge && onNudge && (
            <Button
              size="small"
              variant="outlined"
              disabled={nudgePending || nudgeOnCooldown(proposal.lastNudgeAt)}
              aria-label={`Nudge pending voters for ${proposal.title}`}
              sx={{
                flexShrink: 0,
                border: `2px solid ${GARDEN_TOKENS.ink}`,
                color: GARDEN_TOKENS.ink,
                minWidth: 0,
                px: 1,
                py: 0.25,
                fontSize: "0.7rem",
              }}
              onClick={(event) => {
                event.stopPropagation();
                onNudge(proposal.id);
              }}
            >
              Nudge
            </Button>
          )}
        </Stack>

        {/* When */}
        {timeLabel &&
          !proposal.isContentMasked &&
          proposal.specialKind !== "residency" &&
          proposal.cardKind !== "residency" && (
            <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.75 }}>
              <AccessTimeIcon sx={{ fontSize: 16, color: GARDEN_TOKENS.inkMuted, mt: 0.25, flexShrink: 0 }} />
              <Typography
                variant="body2"
                sx={{ color: GARDEN_TOKENS.inkMuted, overflowWrap: "anywhere", wordBreak: "break-word" }}
              >
                {timeLabel}
              </Typography>
            </Stack>
          )}

        {!proposal.isContentMasked &&
          proposal.cardKind !== "partnership" &&
          proposal.specialKind !== "residency" &&
          proposal.cardKind !== "residency" && (
            <ProposalExpiryCountdown
              proposedExpiresAt={proposal.proposedExpiresAt}
              atRisk={proposal.atRisk}
              atRiskExpiresAt={proposal.atRiskExpiresAt}
            />
          )}

        {/* Where */}
        {locationLine && !proposal.isContentMasked && (
          <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.5 }}>
            <LocationOnOutlinedIcon
              sx={{ fontSize: 16, color: GARDEN_TOKENS.inkMuted, mt: 0.25, flexShrink: 0 }}
            />
            <Typography
              variant="body2"
              sx={{ color: GARDEN_TOKENS.inkMuted, overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
              {locationLine}
            </Typography>
          </Stack>
        )}

        {/* Act — one emphasis status */}
        {status && (
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
            <Chip
              label={status.label}
              size="small"
              variant={proposal.notOnCalendar && !proposal.needsViewerAction && !proposal.atRisk ? "outlined" : "filled"}
              sx={status.sx}
            />
            {sparseBadges.map((badge) => (
              <Chip
                key={badge}
                label={badge}
                size="small"
                variant="outlined"
                sx={{
                  height: 22,
                  fontSize: "0.65rem",
                  borderColor: GARDEN_TOKENS.ink,
                  color: GARDEN_TOKENS.inkMuted,
                }}
              />
            ))}
          </Stack>
        )}

        {proposal.state !== "draft" && proposal.inviteeCount > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ color: GARDEN_TOKENS.inkMuted }}>
              {responseLabel(proposal)}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={responsePct}
              sx={{
                mt: 0.5,
                height: 8,
                borderRadius: 999,
                border: `2px solid ${GARDEN_TOKENS.ink}`,
                bgcolor: "#E8F0E9",
                "& .MuiLinearProgress-bar": {
                  bgcolor: GARDEN_TOKENS.sage,
                  borderRadius: 999,
                },
              }}
            />
          </Box>
        )}
      </CardContent>

      {(proposal.state === "draft" && (onContinueEdit || onDeleteDraft)) ||
      (proposal.canAdminDeleteProposal && onAdminDelete) ? (
        <CardActions
          sx={{ px: 2, pb: 2, pt: 0, flexWrap: "wrap", gap: 1, position: "relative", zIndex: 1 }}
          onClick={(e) => e.stopPropagation()}
        >
          {proposal.state === "draft" && onContinueEdit && (
            <Button
              variant="contained"
              size="small"
              sx={primaryButtonSx}
              onClick={(event) => {
                event.stopPropagation();
                onContinueEdit(proposal.id);
              }}
            >
              Continue Editing
            </Button>
          )}
          {proposal.state === "draft" && onDeleteDraft && (
            <Button
              variant="outlined"
              size="small"
              sx={{
                border: `2px solid ${GARDEN_TOKENS.ink}`,
                color: GARDEN_TOKENS.terracotta,
                boxShadow: "none",
              }}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteDraft(proposal.id);
              }}
            >
              Delete Draft
            </Button>
          )}
          {proposal.canAdminDeleteProposal && onAdminDelete && (
            <Button
              variant="outlined"
              size="small"
              color="error"
              sx={{
                border: `2px solid ${GARDEN_TOKENS.ink}`,
                color: GARDEN_TOKENS.terracotta,
                boxShadow: "none",
                ml: proposal.state === "draft" ? 0 : "auto",
              }}
              onClick={(event) => {
                event.stopPropagation();
                onAdminDelete(proposal.id);
              }}
            >
              Admin delete
            </Button>
          )}
        </CardActions>
      ) : null}
    </Card>
  );
}
