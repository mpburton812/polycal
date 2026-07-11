"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ChecklistRtlIcon from "@mui/icons-material/ChecklistRtl";
import SyncIcon from "@mui/icons-material/Sync";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

import { GARDEN_TOKENS } from "@/theme/tokens";

import { POLY_GREEN } from "./proposalCardTheme";

export type DraftScheduleMode = "window" | "allDay" | "poll" | "recurring";

export interface ProposalDraftScheduleModeGridProps {
  mode: DraftScheduleMode;
  onModeChange: (mode: DraftScheduleMode) => void;
  /** When true, Recurring is unavailable (e.g. batch sleeping). */
  disableRecurring?: boolean;
}

const MODES: {
  id: DraftScheduleMode;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "window", label: "Window", icon: <AccessTimeIcon fontSize="small" /> },
  { id: "allDay", label: "All Day", icon: <CalendarMonthOutlinedIcon fontSize="small" /> },
  { id: "poll", label: "Poll", icon: <ChecklistRtlIcon fontSize="small" /> },
  { id: "recurring", label: "Recurring", icon: <SyncIcon fontSize="small" /> },
];

/**
 * Top-of-draft schedule mode picker — Window / All Day / Poll / Recurring (PC-152).
 * Poll greys out Recurring (mutually exclusive).
 */
export function ProposalDraftScheduleModeGrid({
  mode,
  onModeChange,
  disableRecurring = false,
}: ProposalDraftScheduleModeGridProps) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN, mb: 1 }}>
        Schedule type
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={mode}
        onChange={(_, next) => {
          if (!next) return;
          onModeChange(next as DraftScheduleMode);
        }}
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" },
          gap: 1,
          width: "100%",
          "& .MuiToggleButtonGroup-grouped": {
            border: `2px solid ${GARDEN_TOKENS.ink} !important`,
            borderRadius: "10px !important",
            margin: 0,
            minWidth: 0,
          },
        }}
      >
        {MODES.map((item) => {
          const disabled = item.id === "recurring" && (mode === "poll" || disableRecurring);
          return (
            <ToggleButton
              key={item.id}
              value={item.id}
              disabled={disabled}
              aria-label={item.label}
              sx={{
                flexDirection: "column",
                gap: 0.5,
                py: 1.25,
                px: 0.5,
                textTransform: "none",
                color: GARDEN_TOKENS.ink,
                minWidth: 0,
                overflow: "hidden",
                "&.Mui-selected": {
                  bgcolor: POLY_GREEN,
                  color: "#fff",
                  "&:hover": { bgcolor: POLY_GREEN },
                },
                "&.Mui-disabled": {
                  opacity: 0.4,
                },
              }}
            >
              {item.icon}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.2,
                  overflowWrap: "anywhere",
                  textAlign: "center",
                }}
              >
                {item.label}
              </Typography>
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
      {mode === "poll" && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
          Recurring is unavailable while Poll is selected.
        </Typography>
      )}
    </Box>
  );
}

/** Derives the mode grid value from draft boolean flags. */
export function scheduleModeFromFlags(input: {
  allDay: boolean;
  isPoll: boolean;
  isRecurring: boolean;
}): DraftScheduleMode {
  if (input.isPoll) return "poll";
  if (input.isRecurring) return "recurring";
  if (input.allDay) return "allDay";
  return "window";
}

/** Applies a mode selection onto draft boolean flags (PC-152). */
export function flagsFromScheduleMode(mode: DraftScheduleMode): {
  allDay: boolean;
  isPoll: boolean;
  isRecurring: boolean;
} {
  switch (mode) {
    case "allDay":
      return { allDay: true, isPoll: false, isRecurring: false };
    case "poll":
      return { allDay: false, isPoll: true, isRecurring: false };
    case "recurring":
      return { allDay: false, isPoll: false, isRecurring: true };
    default:
      return { allDay: false, isPoll: false, isRecurring: false };
  }
}
