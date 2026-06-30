"use client";

import BedIcon from "@mui/icons-material/Bed";
import { Box, Typography } from "@mui/material";

import type { ScheduleEvent } from "@/actions/schedule";
import { scheduleBlockSx, scheduleBlockVariant } from "@/lib/schedule/colors";
import { formatEventTime } from "@/lib/schedule/dates";

interface ScheduleEventBlockProps {
  event: ScheduleEvent;
  compact?: boolean;
  timeZone?: string;
  onClick: () => void;
}

/** Formats stakeholder names for calendar blocks, respecting privacy masking (PC-43). */
function formatStakeholders(event: ScheduleEvent): string | null {
  if (event.isContentMasked) return "Private";
  if (event.intentionalSolo) {
    return event.proposerName;
  }
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
 * Clickable calendar block: sleeping uses PC-66 title lines; events use title/location/status (PC-56).
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
  const isSleeping = event.proposalType === "sleeping";
  const sleepingLines =
    isSleeping && !event.isContentMasked ? event.title.split("\n") : null;

  let lineOne: string;
  let lineTwo: string;

  if (sleepingLines) {
    lineOne = sleepingLines[0] ?? event.title;
    const lineTwoParts: string[] = [];
    if (sleepingLines[1]) lineTwoParts.push(sleepingLines[1]);
    if (timeLabel) lineTwoParts.push(timeLabel);
    lineTwo = lineTwoParts.join(", ");
  } else {
    const lineOneParts = [event.title];
    if (!event.isContentMasked && event.locationName) {
      lineOneParts.push(event.locationName);
    }
    lineOneParts.push(statusLabel);
    lineOne = lineOneParts.join(", ");

    const lineTwoParts: string[] = [];
    if (timeLabel) lineTwoParts.push(timeLabel);
    if (stakeholders) lineTwoParts.push(stakeholders);
    lineTwo = lineTwoParts.join(", ");
  }

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`${lineOne}. ${lineTwo}`}
      title={`${lineOne}\n${lineTwo}`}
      sx={{
        position: "relative",
        display: "block",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
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
      {isSleeping && (
        <BedIcon
          aria-hidden
          sx={{
            position: "absolute",
            right: compact ? 2 : 4,
            bottom: compact ? 0 : 2,
            fontSize: compact ? 40 : 52,
            opacity: 0.18,
            color: "currentColor",
            pointerEvents: "none",
          }}
        />
      )}
      <Box sx={{ position: "relative", zIndex: 1, minWidth: 0 }}>
        <Typography
          variant={compact ? "caption" : "body2"}
          fontWeight={600}
          noWrap
          sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {lineOne}
        </Typography>
        <Typography
          variant="caption"
          display="block"
          noWrap
          sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {lineTwo}
        </Typography>
      </Box>
    </Box>
  );
}
