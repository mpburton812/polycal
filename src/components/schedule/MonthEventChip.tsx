"use client";

import { Box, Typography } from "@mui/material";

import type { ScheduleEvent } from "@/actions/schedule";
import { MASKED_TITLE } from "@/lib/proposals/access";
import { scheduleBlockSx, type ScheduleBlockVariant } from "@/lib/schedule/colors";
import { TENTATIVE_HATCH_BACKGROUND } from "@/lib/proposals/tentative-title";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface MonthEventChipProps {
  event: ScheduleEvent;
  variant: ScheduleBlockVariant;
  onClick: () => void;
}

/**
 * Timed month line: color dot, short start time, truncated title (PC-523).
 */
export function MonthTimedLine({
  event,
  variant,
  timeLabel,
  onClick,
}: MonthEventChipProps & { timeLabel: string }) {
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
      title={`${timeLabel} ${label}`}
      aria-label={`${timeLabel} ${label}`}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        width: "100%",
        minWidth: 0,
        height: 18,
        border: "none",
        bgcolor: "transparent",
        p: 0,
        cursor: "pointer",
        textAlign: "left",
        opacity: event.state === "archived" ? 0.85 : 1,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          bgcolor: colors.bgcolor,
          border: `1px solid ${GARDEN_TOKENS.ink}`,
          flexShrink: 0,
        }}
      />
      <Typography
        component="span"
        sx={{ fontSize: "0.65rem", fontWeight: 700, lineHeight: 1.2, flexShrink: 0 }}
      >
        {timeLabel}
      </Typography>
      <Typography
        component="span"
        sx={{
          fontSize: "0.65rem",
          lineHeight: 1.2,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {label}
      </Typography>
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
        backgroundImage: event.isTentative
          ? TENTATIVE_HATCH_BACKGROUND
          : colors.backgroundImage,
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
  /** Soft Tentative hatch (PC-494). */
  isTentative?: boolean;
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
  isTentative = false,
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
        backgroundImage: isTentative
          ? TENTATIVE_HATCH_BACKGROUND
          : colors.backgroundImage,
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
      {count} more
    </Typography>
  );
}
