"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";

import type { EventIconKey } from "@/lib/event-icons/registry";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
import { GARDEN_TOKENS } from "@/theme/tokens";

import { EventIconPicker } from "./EventIconPicker";
import { POLY_GREEN } from "./proposalCardTheme";

export interface ProposalDraftMoreOptionsProps {
  proposalType: "event" | "sleeping";
  description: string;
  onDescriptionChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  eventIconKey: EventIconKey | null;
  onEventIconKeyChange: (value: EventIconKey | null) => void;
  reminderEnabled: boolean;
  onReminderEnabledChange: (value: boolean) => void;
  reminderValue: number;
  onReminderValueChange: (value: number) => void;
  reminderUnit: "days" | "hours" | "minutes";
  onReminderUnitChange: (value: "days" | "hours" | "minutes") => void;
  /** Post lifecycle milestones to Feed (PC-414). Default off. */
  postToFeed: boolean;
  onPostToFeedChange: (value: boolean) => void;
  isPoll?: boolean;
  onPollChange?: (value: boolean) => void;
  hidePoll?: boolean;
  isRecurring?: boolean;
  onRecurringChange?: (value: boolean) => void;
  recurrencePattern?: "daily" | "weekly" | "monthly" | "yearly";
  onRecurrencePatternChange?: (value: "daily" | "weekly" | "monthly" | "yearly") => void;
  recurrenceCount?: number;
  onRecurrenceCountChange?: (value: number) => void;
}

/**
 * Collapsed “More options” accordion for draft proposals (PC-132).
 * Poll and Recurring live here so the primary path stays calendar → Who → Where (PC-434).
 */
export function ProposalDraftMoreOptions({
  proposalType,
  description,
  onDescriptionChange,
  notes,
  onNotesChange,
  eventIconKey,
  onEventIconKeyChange,
  reminderEnabled,
  onReminderEnabledChange,
  reminderValue,
  onReminderValueChange,
  reminderUnit,
  onReminderUnitChange,
  postToFeed,
  onPostToFeedChange,
  isPoll = false,
  onPollChange,
  hidePoll = false,
  isRecurring = false,
  onRecurringChange,
  recurrencePattern = "weekly",
  onRecurrencePatternChange,
  recurrenceCount = 4,
  onRecurrenceCountChange,
}: ProposalDraftMoreOptionsProps) {
  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        mb: 1,
        border: `1px solid ${GARDEN_TOKENS.ink}`,
        borderRadius: "8px !important",
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN }}>
          More options
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {proposalType === "event" && onPollChange && !hidePoll ? (
            <ToggleButton
              value="poll"
              selected={isPoll}
              onClick={() => {
                const next = !isPoll;
                onPollChange(next);
                if (next) onRecurringChange?.(false);
              }}
              size="small"
              sx={{ alignSelf: "flex-start" }}
            >
              Poll
            </ToggleButton>
          ) : null}
          {proposalType === "event" && onRecurringChange ? (
            <>
              <ToggleButton
                value="recurring"
                selected={isRecurring}
                disabled={isPoll}
                onClick={() => onRecurringChange(!isRecurring)}
                size="small"
                sx={{ alignSelf: "flex-start" }}
              >
                Recurring
              </ToggleButton>
              {isRecurring && onRecurrencePatternChange && onRecurrenceCountChange ? (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="recurrence-pattern-label">Pattern</InputLabel>
                    <Select
                      labelId="recurrence-pattern-label"
                      label="Pattern"
                      value={recurrencePattern}
                      onChange={(event) =>
                        onRecurrencePatternChange(
                          event.target.value as "daily" | "weekly" | "monthly" | "yearly",
                        )
                      }
                    >
                      <MenuItem value="daily">Daily</MenuItem>
                      <MenuItem value="weekly">Weekly</MenuItem>
                      <MenuItem value="monthly">Monthly</MenuItem>
                      <MenuItem value="yearly">Yearly</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="Occurrences"
                    type="number"
                    size="small"
                    value={recurrenceCount}
                    onChange={(event) =>
                      onRecurrenceCountChange(
                        Math.min(52, Math.max(2, Number(event.target.value) || 2)),
                      )
                    }
                    inputProps={{ min: 2, max: 52 }}
                    sx={{ width: { xs: "100%", sm: 140 } }}
                  />
                </Stack>
              ) : null}
            </>
          ) : null}
          {proposalType === "sleeping" && (
            <Typography variant="caption" color="text.secondary">
              Sleeping titles are auto-generated from people, place, and status.
            </Typography>
          )}
          <TextField
            label="Details (optional)"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            size="small"
            inputProps={{ maxLength: LONG_TEXT_MAX, "aria-label": "Details" }}
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            size="small"
            inputProps={{ maxLength: LONG_TEXT_MAX }}
            helperText="Shared with invitees"
          />
          {proposalType === "event" && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN, mb: 1 }}>
                Event icon (optional)
              </Typography>
              <EventIconPicker value={eventIconKey} onChange={onEventIconKeyChange} />
            </Box>
          )}
          {proposalType === "event" && (
            <Stack spacing={1.5}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={postToFeed}
                    onChange={(event) => onPostToFeedChange(event.target.checked)}
                  />
                }
                label="Post to Feed"
              />
              <Typography variant="caption" color="text.secondary">
                When off (default), this event’s milestones stay off the network Feed.
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={reminderEnabled}
                    onChange={(event) => onReminderEnabledChange(event.target.checked)}
                  />
                }
                label="Reminder before event"
              />
              {reminderEnabled && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    label="Amount"
                    type="number"
                    size="small"
                    value={reminderValue}
                    onChange={(event) =>
                      onReminderValueChange(Math.max(1, Number(event.target.value) || 1))
                    }
                    inputProps={{ min: 1 }}
                    sx={{ width: 100 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="reminder-unit-label">Unit</InputLabel>
                    <Select
                      labelId="reminder-unit-label"
                      label="Unit"
                      value={reminderUnit}
                      onChange={(event) =>
                        onReminderUnitChange(event.target.value as "days" | "hours" | "minutes")
                      }
                    >
                      <MenuItem value="days">Days</MenuItem>
                      <MenuItem value="hours">Hours</MenuItem>
                      <MenuItem value="minutes">Minutes</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="text.secondary">
                    before start
                  </Typography>
                </Stack>
              )}
            </Stack>
          )}
          {proposalType === "sleeping" && (
            <Stack spacing={0.5}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={postToFeed}
                    onChange={(event) => onPostToFeedChange(event.target.checked)}
                  />
                }
                label="Post to Feed"
              />
              <Typography variant="caption" color="text.secondary">
                When off (default), this event’s milestones stay off the network Feed.
              </Typography>
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
