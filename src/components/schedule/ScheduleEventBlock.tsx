"use client";

import BedIcon from "@mui/icons-material/Bed";
import { Box, Typography } from "@mui/material";

import type { ScheduleEvent } from "@/actions/schedule";
import { EventCategoryIcon } from "@/lib/event-icons/EventCategoryIcon";
import { isEventIconKey } from "@/lib/event-icons/registry";
import { MASKED_TITLE } from "@/lib/proposals/access";
import { scheduleBlockSx, scheduleBlockVariant } from "@/lib/schedule/colors";
import { formatEventTime } from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface ScheduleEventBlockProps {
  event: ScheduleEvent;
  compact?: boolean;
  timeZone?: string;
  rotationIndex?: number;
  onClick: () => void;
}

/** Formats stakeholder names for calendar blocks, respecting privacy masking (PC-43). */
function formatStakeholders(event: ScheduleEvent): string | null {
  if (event.isContentMasked) return MASKED_TITLE;
  if (event.intentionalSolo) {
    return event.proposerName;
  }
  if (event.participantNames.length === 0) return null;
  return event.participantNames.join(", ");
}

/** Status fragment for line-one event card format (PC-56). Approved events omit Confirmed. */
function formatStatusLabel(event: ScheduleEvent): string {
  const parts: string[] = [];
  if (event.isTentative) parts.push("Tentative");
  if (event.atRisk) parts.push("At risk");
  if (event.hasOverlap) parts.push("Conflict");
  return parts.join(", ");
}

/**
 * Clickable calendar block with Garden Brutalism pastel fills and ink borders.
 */
export function ScheduleEventBlock({
  event,
  compact = false,
  timeZone = DEFAULT_VIEWER_TIMEZONE,
  rotationIndex = 0,
  onClick,
}: ScheduleEventBlockProps) {
  const variant = scheduleBlockVariant({
    state: event.state,
    proposalType: event.proposalType,
    isContentMasked: event.isContentMasked,
    hasOverlap: event.hasOverlap,
    atRisk: event.atRisk,
    isPartnerOnlySleeping: event.isPartnerOnlySleeping,
  });
  const colors = scheduleBlockSx(variant, rotationIndex);
  const stakeholders = formatStakeholders(event);
  const timeLabel = formatEventTime(
    event.startAt,
    event.endAt,
    event.proposalType,
    timeZone,
    event.isAllDay,
  );
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
    if (statusLabel) lineOneParts.push(statusLabel);
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
        px: compact ? 0.75 : 1,
        py: compact ? 0.5 : 0.75,
        mb: compact ? 0.5 : 0.75,
        bgcolor: colors.bgcolor,
        color: colors.color,
        border: colors.border,
        borderRadius: colors.borderRadius,
        transform: colors.transform,
        backgroundImage: colors.backgroundImage,
        boxShadow: "none",
        transition: "transform 0.12s ease, filter 0.12s ease",
        "&:hover": {
          filter: "brightness(0.97)",
          transform: `${colors.transform} translate(1px, 1px)`,
        },
        "&:focus-visible": {
          outline: `2px solid ${GARDEN_TOKENS.ink}`,
          outlineOffset: 2,
        },
      }}
    >
      {isSleeping ? (
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
      ) : (
        !event.isContentMasked &&
        isEventIconKey(event.eventIconKey) && (
          <EventCategoryIcon
            iconKey={event.eventIconKey}
            sx={{
              position: "absolute",
              right: compact ? 0 : 2,
              bottom: compact ? -2 : 0,
              fontSize: compact ? 44 : 56,
              opacity: 0.2,
              color: "currentColor",
              pointerEvents: "none",
            }}
          />
        )
      )}
      <Box sx={{ position: "relative", zIndex: 1, minWidth: 0 }}>
        <Typography
          variant={compact ? "caption" : "body2"}
          fontWeight={600}
          noWrap
          sx={{
            fontFamily: fontFamilies.label,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {lineOne}
        </Typography>
        <Typography
          variant="caption"
          display="block"
          noWrap
          sx={{
            fontFamily: fontFamilies.body,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {lineTwo}
        </Typography>
      </Box>
    </Box>
  );
}
