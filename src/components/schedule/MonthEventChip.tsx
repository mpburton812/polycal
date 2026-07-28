"use client";

import BedIcon from "@mui/icons-material/Bed";
import EventIcon from "@mui/icons-material/Event";
import { Box, Typography } from "@mui/material";

import type { ScheduleEvent } from "@/actions/schedule";
import { EventCategoryIcon } from "@/lib/event-icons/EventCategoryIcon";
import { isEventIconKey } from "@/lib/event-icons/registry";
import { MASKED_TITLE } from "@/lib/proposals/access";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";
import { scheduleBlockSx, type ScheduleBlockVariant } from "@/lib/schedule/colors";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface MonthEventChipProps {
  event: ScheduleEvent;
  variant: ScheduleBlockVariant;
  onClick: () => void;
}

/**
 * Compact status-colored calendar icon for single-day month cells (PC-77).
 */
export function MonthEventIcon({ event, variant, onClick }: MonthEventChipProps) {
  const colors = scheduleBlockSx(variant, 0);
  const label = event.isContentMasked ? MASKED_TITLE : event.title;
  const isSleeping = isSleepingLikeType(event.proposalType);

  return (
    <Box
      component="button"
      type="button"
      onClick={(eventClick) => {
        eventClick.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        p: 0,
        m: 0,
        bgcolor: "transparent",
        cursor: "pointer",
        lineHeight: 0,
        opacity: event.state === "archived" ? 0.85 : 1,
      }}
    >
      {isSleeping ? (
        <BedIcon
          sx={{
            fontSize: 16,
            color: colors.bgcolor,
            filter: `drop-shadow(0 0 0.75px ${colors.color})`,
          }}
        />
      ) : isEventIconKey(event.eventIconKey) ? (
        <EventCategoryIcon
          iconKey={event.eventIconKey}
          sx={{
            fontSize: 16,
            color: colors.bgcolor,
            filter: `drop-shadow(0 0 0.75px ${colors.color})`,
          }}
        />
      ) : (
        <EventIcon
          sx={{
            fontSize: 16,
            color: colors.bgcolor,
            filter: `drop-shadow(0 0 0.75px ${colors.color})`,
          }}
        />
      )}
    </Box>
  );
}

/**
 * Compact month-cell event chip using shared schedule semantic colors.
 */
export function MonthEventChip({ event, variant, onClick }: MonthEventChipProps) {
  const colors = scheduleBlockSx(variant, 0);
  const label = event.isContentMasked ? MASKED_TITLE : event.title;

  return (
    <Box
      component="button"
      type="button"
      onClick={(eventClick) => {
        eventClick.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      sx={{
        display: "block",
        width: "100%",
        border: colors.border,
        borderRadius: "4px",
        bgcolor: colors.bgcolor,
        color: colors.color,
        backgroundImage: colors.backgroundImage,
        px: 0.5,
        py: 0.125,
        fontSize: "0.6rem",
        lineHeight: 1.2,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        transform: "none",
        opacity: event.state === "archived" ? 0.85 : 1,
      }}
    >
      {label}
    </Box>
  );
}

interface MonthSpanBarProps {
  title: string;
  variant: ScheduleBlockVariant;
  showTitle: boolean;
  isStartSegment: boolean;
  isEndSegment: boolean;
  isArchived: boolean;
  onClick: () => void;
}

/** Multi-day span segment in the week overlay row. */
export function MonthSpanBar({
  title,
  variant,
  showTitle,
  isStartSegment,
  isEndSegment,
  isArchived,
  onClick,
}: MonthSpanBarProps) {
  const colors = scheduleBlockSx(variant, 0);
  const radius = 4;
  const borderRadius = `${isStartSegment ? radius : 0}px ${isEndSegment ? radius : 0}px ${isEndSegment ? radius : 0}px ${isStartSegment ? radius : 0}px`;

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      sx={{
        width: "100%",
        height: "100%",
        border: colors.border,
        borderRadius,
        bgcolor: colors.bgcolor,
        color: colors.color,
        backgroundImage: colors.backgroundImage,
        px: 0.5,
        py: 0.125,
        fontSize: "0.6rem",
        lineHeight: 1.2,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        transform: "none",
        opacity: isArchived ? 0.85 : 1,
        minHeight: 16,
      }}
    >
      {showTitle ? title : "\u00a0"}
    </Box>
  );
}

interface MonthMoreLinkProps {
  count: number;
  onClick: () => void;
}

/** Overflow affordance — opens the day sheet (PC-165). */
export function MonthMoreLink({ count, onClick }: MonthMoreLinkProps) {
  if (count <= 0) return null;

  return (
    <Typography
      component="button"
      type="button"
      variant="caption"
      aria-label={`Show ${count} more events`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      sx={{
        display: "block",
        border: "none",
        background: "none",
        p: 0,
        mt: 0.25,
        fontSize: "0.6rem",
        color: GARDEN_TOKENS.sage,
        cursor: "pointer",
        textAlign: "left",
        fontWeight: 600,
        "&:hover": { textDecoration: "underline" },
      }}
    >
      +{count} more
    </Typography>
  );
}

interface StateDotStripProps {
  variants: ScheduleBlockVariant[];
}

/** Up to four state dots when multiple event types share a day. */
export function StateDotStrip({ variants }: StateDotStripProps) {
  if (variants.length <= 1) return null;

  return (
    <Box sx={{ display: "flex", gap: 0.25, justifyContent: "flex-end", mb: 0.25 }}>
      {variants.map((variant) => {
        const colors = scheduleBlockSx(variant, 0);
        return (
          <Box
            key={variant}
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: colors.bgcolor,
              border: "1px solid",
              borderColor: "divider",
            }}
            aria-hidden
          />
        );
      })}
    </Box>
  );
}
