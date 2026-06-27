"use client";

import { Box, Typography } from "@mui/material";

import type { ScheduleEvent } from "@/actions/schedule";
import { formatEventTime } from "@/lib/schedule/dates";
import { scheduleBlockSx, scheduleBlockVariant } from "@/lib/schedule/colors";

interface ScheduleEventBlockProps {
  event: ScheduleEvent;
  compact?: boolean;
  timeZone?: string;
  onClick: () => void;
}

/** Formats stakeholder names for calendar blocks, respecting privacy masking (PC-43). */
function formatStakeholders(event: ScheduleEvent): string | null {
  if (event.isContentMasked) return "Private";
  if (event.intentionalSolo) return "Solo";
  if (event.participantNames.length === 0) return null;
  return event.participantNames.join(", ");
}

/** Status fragment for line-one event card format (PC-56). */
function formatStatusLabel(event: ScheduleEvent): string {
  const parts: string[] = [];
  parts.push(event.isTentative ? "Tentative" : "Confirmed");
  if (event.atRisk) parts.push("At risk");
  if (event.hasOverlap) parts.push("Conflict");
  return parts.join(", ");
}

/**
 * Clickable calendar block: title, location, status on line one; date and attendees on line two (PC-56).
 */
export function ScheduleEventBlock({
  event,
  compact = false,
  timeZone = "UTC",
  onClick,
}: ScheduleEventBlockProps) {
  const variant = scheduleBlockVariant({
    state: event.state,
    proposalType: event.proposalType,
    isContentMasked: event.isContentMasked,
    hasOverlap: event.hasOverlap,
    atRisk: event.atRisk,
  });
  const colors = scheduleBlockSx(variant);
  const stakeholders = formatStakeholders(event);
  const timeLabel = formatEventTime(event.startAt, event.endAt, event.proposalType, timeZone);
  const statusLabel = formatStatusLabel(event);

  const lineOneParts = [event.title];
  if (!event.isContentMasked && event.locationName) {
    lineOneParts.push(event.locationName);
  }
  lineOneParts.push(statusLabel);
  const lineOne = lineOneParts.join(", ");

  const lineTwoParts: string[] = [];
  if (timeLabel) lineTwoParts.push(timeLabel);
  if (stakeholders) lineTwoParts.push(stakeholders);
  const lineTwo = lineTwoParts.join(", ");

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`${lineOne}. ${lineTwo}`}
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
        {lineOne}
      </Typography>
      <Typography variant="caption" display="block" noWrap>
        {lineTwo}
      </Typography>
      {!compact && event.proposalType === "sleeping" && (
        <Typography variant="caption" display="block" color="inherit" sx={{ opacity: 0.85 }}>
          Overnight arrangement
        </Typography>
      )}
    </Box>
  );
}
