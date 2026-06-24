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

const POLY_GREEN = "#004d40";
const POLY_GREEN_LIGHT = "#e0f2f1";

function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const startLabel = new Date(start).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!end) return startLabel;
  const endLabel = new Date(end).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}

function typeBadgeLabel(type: string): string {
  return type === "sleeping" ? "SLEEPING PROPOSAL" : "EVENT PROPOSAL";
}

function stateBadgeLabel(state: string): string {
  return state.toUpperCase();
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
        borderLeft: `4px solid ${POLY_GREEN}`,
        borderRadius: 2,
        cursor: "pointer",
        transition: "box-shadow 0.2s",
        "&:hover": { boxShadow: 3 },
      }}
      onClick={() => onOpen(proposal.id)}
    >
      <CardContent sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
          <Chip
            label={typeBadgeLabel(proposal.proposalType)}
            size="small"
            sx={{
              bgcolor: POLY_GREEN_LIGHT,
              color: POLY_GREEN,
              fontWeight: 700,
              fontSize: "0.65rem",
              letterSpacing: 0.5,
            }}
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
            label={stateBadgeLabel(proposal.state)}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600, fontSize: "0.65rem" }}
          />
          {proposal.atRisk && <Chip size="small" label="At risk" color="warning" />}
          {proposal.needsViewerAction && (
            <Chip size="small" label="Action needed" sx={{ bgcolor: POLY_GREEN, color: "#fff" }} />
          )}
        </Stack>

        {timeLabel && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
            <AccessTimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              {timeLabel}
            </Typography>
          </Stack>
        )}

        {proposal.locationName && (
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
              bgcolor: "#fff8e1",
              borderRadius: 1,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <WarningAmberIcon sx={{ fontSize: 18, color: "#f9a825" }} />
            <Typography variant="body2" sx={{ color: "#f57f17", fontWeight: 500 }}>
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
              sx={{ bgcolor: POLY_GREEN, "&:hover": { bgcolor: "#00332c" } }}
              onClick={() => onContinueEdit(proposal.id)}
            >
              Continue Editing
            </Button>
          )}
          {onDeleteDraft && (
            <Button
              variant="outlined"
              size="small"
              color="error"
              onClick={() => onDeleteDraft(proposal.id)}
            >
              Delete Draft
            </Button>
          )}
        </CardActions>
      )}
    </Card>
  );
}
