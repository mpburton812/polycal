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

import {
  formatTimeRange,
  POLY_GREEN,
  POLY_GREEN_LIGHT,
  PAST_SCHEDULE_BG,
  PAST_SCHEDULE_ICON,
  PAST_SCHEDULE_TEXT,
  primaryButtonSx,
  proposalCardSx,
  typeBadgeLabel,
  typeChipSx,
} from "./proposalCardTheme";

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
 * Graphical proposal card matching Phase 4 mockup (PC-40).
 */
export function ProposalCard({
  proposal,
  onOpen,
  onContinueEdit,
  onDeleteDraft,
}: ProposalCardProps) {
  const timeLabel = formatTimeRange(proposal.scheduledStartAt, proposal.scheduledEndAt);
  const responsePct =
    proposal.inviteeCount > 0
      ? Math.round((proposal.respondedCount / proposal.inviteeCount) * 100)
      : 0;

  return (
    <Card
      variant="outlined"
      sx={{
        ...proposalCardSx,
        cursor: "pointer",
        transition: "box-shadow 0.2s",
        "&:hover": { boxShadow: 3 },
      }}
      onClick={() => onOpen(proposal.id)}
    >
      <CardContent sx={{ pb: 1 }}>
        {proposal.cardKind === "partnership" && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Visible only to proposer, invitee, and admins.
          </Typography>
        )}
        {(proposal.specialKind === "residency" || proposal.cardKind === "residency") && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Place residency — no date or time required.
          </Typography>
        )}
        {proposal.specialKind === "group_name" && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Poly group rename — consensus required before applying.
          </Typography>
        )}

        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
          <Chip
            label={typeBadgeLabel(proposal.proposalType, proposal.cardKind, proposal.specialKind)}
            size="small"
            sx={typeChipSx}
          />
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
            PROPOSED BY {proposal.proposerName.toUpperCase()}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
          <Typography variant="h6" component="h2" sx={{ fontSize: "1.1rem", fontWeight: 600 }}>
            {proposal.title}
          </Typography>
          <Chip
            label={stateBadgeLabel(proposal)}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600, fontSize: "0.65rem" }}
          />
          {proposal.atRisk && <Chip size="small" label="At risk" color="warning" />}
          {proposal.needsViewerAction && (
            <Chip size="small" label="Action needed" sx={{ bgcolor: POLY_GREEN, color: "#fff" }} />
          )}
        </Stack>

          {proposal.isContentMasked && (
            <Chip size="small" label="Private" variant="outlined" sx={{ mt: 1 }} />
          )}

        {timeLabel && !proposal.isContentMasked && proposal.specialKind !== "residency" && proposal.cardKind !== "residency" && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
            <AccessTimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              {timeLabel}
            </Typography>
          </Stack>
        )}

        {proposal.locationName && !proposal.isContentMasked && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
            <LocationOnOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
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
              borderRadius: 1,
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
            <Typography variant="caption" color="text.secondary">
              {responseLabel(proposal)}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={responsePct}
              sx={{
                mt: 0.5,
                height: 6,
                borderRadius: 3,
                bgcolor: POLY_GREEN_LIGHT,
                "& .MuiLinearProgress-bar": { bgcolor: POLY_GREEN },
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
              color="error"
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
