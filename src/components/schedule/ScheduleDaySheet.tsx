"use client";

import BedIcon from "@mui/icons-material/Bed";
import EventIcon from "@mui/icons-material/Event";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import type { ScheduleEvent } from "@/actions/schedule";
import { ScheduleEventBlock } from "@/components/schedule/ScheduleEventBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { localDateKey } from "@/lib/schedule/dates";
import { sortDayEvents } from "@/lib/schedule/sort-day-events";
import { GARDEN_TOKENS } from "@/theme/tokens";
import { fontFamilies } from "@/theme/fonts";

interface ScheduleDaySheetProps {
  open: boolean;
  day: Date | null;
  events: ScheduleEvent[];
  timeZone: string;
  onClose: () => void;
  onEventClick: (event: ScheduleEvent) => void;
  onOpenInWeek?: (day: Date) => void;
  onCreateEvent?: (day: Date) => void;
  onCreateSleeping?: (day: Date) => void;
}

/**
 * Day sheet listing events for a calendar day — month/+N and compact overflow (PC-165).
 */
export function ScheduleDaySheet({
  open,
  day,
  events,
  timeZone,
  onClose,
  onEventClick,
  onOpenInWeek,
  onCreateEvent,
  onCreateSleeping,
}: ScheduleDaySheetProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const title = day
    ? day.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "Day";

  const dayEvents = day
    ? sortDayEvents(
        events.filter((event) => {
          const startKey = localDateKey(event.startAt, timeZone);
          const endKey = localDateKey(event.endAt ?? event.startAt, timeZone);
          const key = localDateKey(day.toISOString(), timeZone);
          return key >= startKey && key <= endKey;
        }),
      )
    : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby="schedule-day-sheet-title"
    >
      <DialogTitle id="schedule-day-sheet-title" sx={{ fontFamily: fontFamilies.display }}>
        {title}
      </DialogTitle>
      <DialogContent dividers>
        {dayEvents.length === 0 ? (
          <EmptyState
            illustration="schedule-day"
            title="Nothing on this day"
            description="Add an event or sleeping night."
            compact
          />
        ) : (
          <Stack spacing={1}>
            {dayEvents.map((event, index) => (
              <ScheduleEventBlock
                key={`${event.proposalId}-${event.sliceKey}-${index}`}
                event={event}
                rotationIndex={index}
                timeZone={timeZone}
                onClick={() => onEventClick(event)}
              />
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions
        sx={{
          flexWrap: "wrap",
          gap: 1,
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
        }}
      >
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {day && onCreateEvent && (
            <Button
              size="small"
              startIcon={<EventIcon />}
              onClick={() => onCreateEvent(day)}
              sx={{ color: GARDEN_TOKENS.ink }}
            >
              New event
            </Button>
          )}
          {day && onCreateSleeping && (
            <Button
              size="small"
              startIcon={<BedIcon />}
              onClick={() => onCreateSleeping(day)}
              sx={{ color: GARDEN_TOKENS.ink }}
            >
              New sleeping
            </Button>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {day && onOpenInWeek && (
            <Button size="small" onClick={() => onOpenInWeek(day)}>
              Open in week
            </Button>
          )}
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
