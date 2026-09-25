"use client";

import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";

import type { ScheduleEvent } from "@/actions/schedule";
import { MASKED_TITLE } from "@/lib/proposals/access";
import { scheduleBlockSx, scheduleBlockVariant } from "@/lib/schedule/colors";
import { formatCompactStartTime, localDateKey } from "@/lib/schedule/dates";
import { isMonthBarEvent, mergeVirtualSpanDayEvents, monthLineTier } from "@/lib/schedule/month-layout";
import { TENTATIVE_HATCH_BACKGROUND } from "@/lib/proposals/tentative-title";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface ScheduleMonthDayFlyoutProps {
  open: boolean;
  day: Date | null;
  events: ScheduleEvent[];
  timeZone: string;
  onClose: () => void;
}

/**
 * Read-only day list opened only from a month cell's N more control (PC-524).
 * Closes from the X, Escape, or a click outside. Rows are not actions.
 */
export function ScheduleMonthDayFlyout({
  open,
  day,
  events,
  timeZone,
  onClose,
}: ScheduleMonthDayFlyoutProps) {
  const weekday = day
    ? day.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()
    : "";
  const dayNumber = day ? String(day.getDate()) : "";

  const dayEvents = day
    ? mergeVirtualSpanDayEvents(events)
        .filter((event) => {
          const startKey = localDateKey(event.startAt, timeZone);
          const endKey = localDateKey(event.endAt ?? event.startAt, timeZone);
          const key = localDateKey(day.toISOString(), timeZone);
          return key >= startKey && key <= endKey;
        })
        .sort((a, b) => {
          const tier = monthLineTier(a, timeZone) - monthLineTier(b, timeZone);
          if (tier !== 0) return tier;
          return a.startAt.localeCompare(b.startAt);
        })
    : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="month-day-flyout-title"
    >
      <DialogTitle
        id="month-day-flyout-title"
        sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", pr: 1 }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
            {weekday}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            {dayNumber}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {dayEvents.map((event) => {
            const label = event.isContentMasked ? MASKED_TITLE : event.title;
            const bar = isMonthBarEvent(event, timeZone);
            const colors = scheduleBlockSx(
              scheduleBlockVariant({
                state: event.state,
                proposalType: event.proposalType,
                isContentMasked: event.isContentMasked,
                hasOverlap: event.hasOverlap,
                atRisk: event.atRisk,
                isPartnerOnlySleeping: event.isPartnerOnlySleeping,
              }),
              0,
            );
            if (bar) {
              return (
                <Box
                  key={`${event.id}-bar`}
                  sx={{
                    border: colors.border,
                    borderRadius: "4px",
                    bgcolor: colors.bgcolor,
                    color: colors.color,
                    backgroundImage: event.isTentative ? TENTATIVE_HATCH_BACKGROUND : colors.backgroundImage,
                    px: 0.75,
                    py: 0.25,
                    fontSize: "0.8rem",
                    lineHeight: 1.3,
                  }}
                >
                  {label}
                </Box>
              );
            }
            const timeLabel = formatCompactStartTime(event.startAt, timeZone);
            return (
              <Box
                key={`${event.id}-timed`}
                sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, py: 0.25 }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    mt: "4px",
                    borderRadius: "50%",
                    bgcolor: colors.bgcolor,
                    border: `1px solid ${GARDEN_TOKENS.ink}`,
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0 }}>
                  {timeLabel}
                </Typography>
                <Typography variant="body2">{label}</Typography>
              </Box>
            );
          })}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
