"use client";

import { Box, Typography } from "@mui/material";

import type { ScheduleEvent } from "@/actions/schedule";
import { formatEventTime } from "@/lib/schedule/dates";
import { scheduleBlockSx, scheduleBlockVariant } from "@/lib/schedule/colors";

interface ScheduleEventBlockProps {
  event: ScheduleEvent;
  compact?: boolean;
  onClick: () => void;
}

/** Formats stakeholder names for calendar blocks, respecting privacy masking (PC-43). */
function formatStakeholders(event: ScheduleEvent): string | null {
  if (event.isContentMasked) return "Private";
  if (event.intentionalSolo) return "Solo";
  if (event.participantNames.length === 0) return null;
  return event.participantNames.join(", ");
}

/**
 * Clickable calendar block with tentative/confirmed color coding (PC-42).
 */
export function ScheduleEventBlock({ event, compact = false, onClick }: ScheduleEventBlockProps) {
  const variant = scheduleBlockVariant({
    state: event.state,
    proposalType: event.proposalType,
    isContentMasked: event.isContentMasked,
    hasOverlap: event.hasOverlap,
    atRisk: event.atRisk,
  });
  const colors = scheduleBlockSx(variant);
  const stakeholders = formatStakeholders(event);
  const timeLabel = formatEventTime(event.startAt, event.endAt, event.proposalType);

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`${event.title}, ${timeLabel}${stakeholders ? `, ${stakeholders}` : ""}`}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        borderRadius: 1,
        px: compact ? 0.75 : 1,
        py: compact ? 0.5 : 0.75,
        mb: compact ? 0.5 : 0.75,
        bgcolor: colors.bgcolor,
        color: colors.color,
        border: colors.border,
        backgroundImage: colors.backgroundImage,
        "&:hover": { filter: "brightness(0.97)" },
      }}
    >
      <Typography variant={compact ? "caption" : "body2"} fontWeight={600} noWrap>
        {event.title}
      </Typography>
      <Typography variant="caption" display="block" noWrap>
        {timeLabel}
        {compact && stakeholders ? ` · ${stakeholders}` : ""}
      </Typography>
      {!compact && stakeholders && (
        <Typography variant="caption" display="block" noWrap>
          {stakeholders}
        </Typography>
      )}
      {!compact && (
        <Typography variant="caption" display="block">
          {event.isTentative ? "Tentative" : "Confirmed"}
          {event.atRisk ? " · At risk" : ""}
          {event.hasOverlap ? " · Conflict" : ""}
        </Typography>
      )}
      {!compact && event.locationName && (
        <Typography variant="caption" color="text.secondary" display="block" noWrap>
          {event.locationName}
        </Typography>
      )}
    </Box>
  );
}
