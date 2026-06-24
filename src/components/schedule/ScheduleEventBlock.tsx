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

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`${event.title}, ${formatEventTime(event.startAt, event.endAt)}`}
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
      {!compact && (
        <Typography variant="caption" display="block">
          {formatEventTime(event.startAt, event.endAt)}
          {event.isTentative ? " · Tentative" : ""}
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
