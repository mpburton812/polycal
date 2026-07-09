"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
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
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

import {
  brutalPressSx,
  formatTimeRange,
  PAST_SCHEDULE_BG,
  PAST_SCHEDULE_ICON,
  PAST_SCHEDULE_TEXT,
  primaryButtonSx,
  proposalCardRotation,
  proposalCardSx,
  typeBadgeLabel,
  typeChipSxForProposal,
} from "./proposalCardTheme";
import { ProposalEventIcon } from "./ProposalEventIcon";

function stateBadgeLabel(proposal: ProposalCardData): string {
  if (proposal.workflowStatus === "declined") return "DECLINED";
  return proposal.state.toUpperCase();
}

function responseLabel(proposal: ProposalCardData): string {
  if (proposal.inviteeCount === 0) return "No invitees";
  if (proposal.respondedCount === 0) return "No responses yet";
  return `${proposal.respondedCount} of ${proposal.inviteeCount} responded`;
}

interface ProposalCardProps {
  proposal: ProposalCardData;
  onOpen: (id: string) => void;
  onContinueEdit?: (id: string) => void;
  onDeleteDraft?: (id: string) => void;
}

/**
 * Proposal card with Garden Brutalism ink borders and pastel type chips.
 */
export function ProposalCard({
  proposal,
  onOpen,
  onContinueEdit,
  onDeleteDraft,
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

  return (
    <Card
      variant="outlined"
      sx={{
        ...proposalCardSx,
        ...brutalPressSx,
        cursor: "pointer",
        transform: `rotate(${rotation})`,
        "&:hover": {
          ...brutalPressSx["&:hover"],
          transform: `rotate(${rotation}) translate(1px, 1px)`,
        },
      }}
      onClick={() => onOpen(proposal.id)}
    >
      <CardContent sx={{ pb: 1 }}>
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
        {proposal.specialKind === "group_name" && (
          <Typography
            variant="caption"
            sx={{ display: "block", mb: 0.5, color: GARDEN_TOKENS.inkMuted }}
          >
            Poly group rename — consensus required before applying.
          </Typography>
        )}

        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
          <Chip
            label={typeBadgeLabel(proposal.proposalType, proposal.cardKind, proposal.specialKind)}
            size="small"
            sx={typeChipSxForProposal(
              proposal.proposalType,
              proposal.cardKind,
              proposal.specialKind,
            )}
          />
          <Typography
            variant="caption"
            sx={{
              textAlign: "right",
              fontFamily: fontFamilies.label,
              color: GARDEN_TOKENS.inkMuted,
              fontSize: "0.65rem",
            }}
          >
            PROPOSED BY {proposal.proposerName.toUpperCase()}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
          <ProposalEventIcon
            eventIconKey={proposal.eventIconKey}
            isContentMasked={proposal.isContentMasked}
            proposalType={proposal.proposalType}
          />
          <Typography
            variant="h6"
            component="h2"
            sx={{
              fontFamily: fontFamilies.label,
              fontSize: "1.1rem",
              fontWeight: 600,
            }}
          >
            {proposal.title}
          </Typography>
          <Chip
            label={stateBadgeLabel(proposal)}
            size="small"
            variant="outlined"
            sx={{
              fontWeight: 600,
              fontSize: "0.65rem",
              borderColor: GARDEN_TOKENS.ink,
              color: GARDEN_TOKENS.ink,
            }}
          />
          {proposal.atRisk && (
            <Chip
              size="small"
              label="At risk"
              sx={{
                bgcolor: "#F0C878",
                color: GARDEN_TOKENS.ink,
                border: `2px solid ${GARDEN_TOKENS.ink}`,
              }}
            />
          )}
          {proposal.notOnCalendar && (
            <Chip
              size="small"
              label="Not on calendar"
              color="warning"
              variant="outlined"
              sx={{ borderColor: GARDEN_TOKENS.ink }}
            />
          )}
          {proposal.needsViewerAction && (
            <Chip
              size="small"
              label="Action needed"
              sx={{
                bgcolor: GARDEN_TOKENS.sage,
                color: GARDEN_TOKENS.surface,
                border: `2px solid ${GARDEN_TOKENS.ink}`,
              }}
            />
          )}
        </Stack>

        {proposal.isContentMasked && (
          <Chip
            size="small"
            label="Private"
            variant="outlined"
            sx={{ mt: 1, borderColor: GARDEN_TOKENS.ink }}
          />
        )}

        {timeLabel &&
          !proposal.isContentMasked &&
          proposal.specialKind !== "residency" &&
          proposal.cardKind !== "residency" && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
              <AccessTimeIcon sx={{ fontSize: 16, color: GARDEN_TOKENS.inkMuted }} />
              <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted }}>
                {timeLabel}
              </Typography>
            </Stack>
          )}

        {proposal.locationName && !proposal.isContentMasked && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
            <LocationOnOutlinedIcon sx={{ fontSize: 16, color: GARDEN_TOKENS.inkMuted }} />
            <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted }}>
              {proposal.locationName}
            </Typography>
          </Stack>
        )}

        {proposal.isPastSchedule && (
          <Box
            sx={{
              mt: 1.5,
              p: 1,
              bgcolor: PAST_SCHEDULE_BG,
              borderRadius: "12px 6px 10px 8px",
              border: `2px solid ${GARDEN_TOKENS.ink}`,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <WarningAmberIcon sx={{ fontSize: 18, color: PAST_SCHEDULE_ICON }} />
            <Typography variant="body2" sx={{ color: PAST_SCHEDULE_TEXT, fontWeight: 500 }}>
              Past schedule
            </Typography>
          </Box>
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

      {proposal.state === "draft" && (onContinueEdit || onDeleteDraft) && (
        <CardActions sx={{ px: 2, pb: 2, pt: 0 }} onClick={(e) => e.stopPropagation()}>
          {onContinueEdit && (
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
          {onDeleteDraft && (
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
        </CardActions>
      )}
    </Card>
  );
}
