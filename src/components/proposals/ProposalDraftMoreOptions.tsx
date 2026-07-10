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
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import type { EventIconKey } from "@/lib/event-icons/registry";
import { GARDEN_TOKENS } from "@/theme/tokens";

import { EventIconPicker } from "./EventIconPicker";
import { POLY_GREEN } from "./proposalCardTheme";

export interface ProposalDraftMoreOptionsProps {
  proposalType: "event" | "sleeping";
  description: string;
  onDescriptionChange: (value: string) => void;
  eventPrivacy: "open" | "private" | "super_private";
  onEventPrivacyChange: (value: "open" | "private" | "super_private") => void;
  /** Which privacy MenuItems to show (from poly group settings) (PC-134). */
  privacyAvailability: {
    open: boolean;
    private: boolean;
    superPrivate: boolean;
  };
  notes: string;
  onNotesChange: (value: string) => void;
  eventIconKey: EventIconKey | null;
  onEventIconKeyChange: (value: EventIconKey | null) => void;
  isPoll: boolean;
  onIsPollChange: (value: boolean) => void;
  batchMode: boolean;
  isRecurring: boolean;
  onIsRecurringChange: (value: boolean) => void;
  recurrencePattern: "daily" | "weekly" | "monthly" | "yearly";
  onRecurrencePatternChange: (value: "daily" | "weekly" | "monthly" | "yearly") => void;
  recurrenceCount: number;
  onRecurrenceCountChange: (value: number) => void;
  reminderEnabled: boolean;
  onReminderEnabledChange: (value: boolean) => void;
  reminderValue: number;
  onReminderValueChange: (value: number) => void;
  reminderUnit: "days" | "hours" | "minutes";
  onReminderUnitChange: (value: "days" | "hours" | "minutes") => void;
}

/**
 * Collapsed “More options” accordion for draft proposals (PC-132).
 */
export function ProposalDraftMoreOptions({
  proposalType,
  description,
  onDescriptionChange,
  eventPrivacy,
  onEventPrivacyChange,
  privacyAvailability,
  notes,
  onNotesChange,
  eventIconKey,
  onEventIconKeyChange,
  isPoll,
  onIsPollChange,
  batchMode,
  isRecurring,
  onIsRecurringChange,
  recurrencePattern,
  onRecurrencePatternChange,
  recurrenceCount,
  onRecurrenceCountChange,
  reminderEnabled,
  onReminderEnabledChange,
  reminderValue,
  onReminderValueChange,
  reminderUnit,
  onReminderUnitChange,
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
          {proposalType === "sleeping" && (
            <Typography variant="caption" color="text.secondary">
              Sleeping titles are auto-generated from people, place, and status.
            </Typography>
          )}
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            size="small"
          />
          <FormControl fullWidth size="small">
            <InputLabel id="proposal-privacy-label">Privacy</InputLabel>
            <Select
              labelId="proposal-privacy-label"
              label="Privacy"
              value={eventPrivacy}
              onChange={(event) =>
                onEventPrivacyChange(event.target.value as "open" | "private" | "super_private")
              }
            >
              {privacyAvailability.open && <MenuItem value="open">Open</MenuItem>}
              {privacyAvailability.private && <MenuItem value="private">Private</MenuItem>}
              {privacyAvailability.superPrivate && (
                <MenuItem value="super_private">Super private</MenuItem>
              )}
            </Select>
            <FormHelperText>
              Open: network visibility rules. Private: proposer, invitees, sleeping partners, and
              optionally admins. Super private: proposer and invitees only (admins optional).
            </FormHelperText>
          </FormControl>
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            size="small"
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
            <FormControlLabel
              control={
                <Checkbox
                  checked={isPoll}
                  onChange={(event) => onIsPollChange(event.target.checked)}
                  sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
                />
              }
              label="Time poll (multiple slot options)"
            />
          )}
          {!batchMode && !isPoll && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isRecurring}
                    onChange={(event) => onIsRecurringChange(event.target.checked)}
                    sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
                  />
                }
                label="Recurring series"
              />
              {isRecurring && (
                <Stack direction="row" spacing={1}>
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
                    sx={{ width: 140 }}
                  />
                </Stack>
              )}
            </>
          )}
          {proposalType === "event" && (
            <Stack spacing={1.5}>
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
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
