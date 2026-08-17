"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ChecklistRtlIcon from "@mui/icons-material/ChecklistRtl";
import SyncIcon from "@mui/icons-material/Sync";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

import {
  flagsFromTimingMode,
  timingModeFromFlags,
  type DraftTimingMode,
} from "@/components/proposals/draftScheduleModes";
import { GARDEN_TOKENS } from "@/theme/tokens";

import { POLY_GREEN } from "./proposalCardTheme";

export type { DraftTimingMode };
export { flagsFromTimingMode, timingModeFromFlags };

/** @deprecated Prefer DraftTimingMode + isRecurring. */
export type DraftScheduleMode = DraftTimingMode | "recurring";

export interface ProposalDraftScheduleModeGridProps {
  timingMode: DraftTimingMode | null;
  isRecurring: boolean;
  onTimingModeChange: (mode: DraftTimingMode) => void;
  onRecurringChange: (recurring: boolean) => void;
  disableRecurring?: boolean;
  /** When true, omit Poll (network setting or Schedule posting) (PC-423). */
  hidePoll?: boolean;
}

const TIMING_MODES: { id: DraftTimingMode; label: string; icon: React.ReactNode }[] = [
  { id: "window", label: "Window", icon: <AccessTimeIcon fontSize="small" /> },
  { id: "allDay", label: "All Day", icon: <CalendarMonthOutlinedIcon fontSize="small" /> },
  { id: "poll", label: "Poll", icon: <ChecklistRtlIcon fontSize="small" /> },
];

/**
 * Schedule type picker — Window / All Day / Poll exclusive; Recurring combines
 * with Window or All Day (not Poll) (PC-152 / PC-170).
 */
export function ProposalDraftScheduleModeGrid({
  timingMode,
  isRecurring,
  onTimingModeChange,
  onRecurringChange,
  disableRecurring = false,
  hidePoll = false,
}: ProposalDraftScheduleModeGridProps) {
  const recurringDisabled = timingMode === "poll" || disableRecurring || !timingMode;
  const visibleModes = hidePoll
    ? TIMING_MODES.filter((item) => item.id !== "poll")
    : TIMING_MODES;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN, mb: 1 }}>
        Schedule type
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            sm: "repeat(4, minmax(0, 1fr))",
          },
          gap: 1,
          width: "100%",
        }}
      >
        <ToggleButtonGroup
          exclusive
          value={timingMode}
          onChange={(_, next) => {
            if (!next) return;
            onTimingModeChange(next as DraftTimingMode);
          }}
          sx={{
            display: "contents",
            "& .MuiToggleButtonGroup-grouped": {
              border: `2px solid ${GARDEN_TOKENS.ink} !important`,
              borderRadius: "10px !important",
              margin: 0,
              minWidth: 0,
            },
          }}
        >
          {visibleModes.map((item) => (
            <ToggleButton
              key={item.id}
              value={item.id}
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
          ))}
        </ToggleButtonGroup>

        <ToggleButton
          value="recurring"
          selected={isRecurring && !recurringDisabled}
          disabled={recurringDisabled}
          aria-label="Recurring"
          aria-pressed={isRecurring && !recurringDisabled}
          onClick={() => {
            if (recurringDisabled) return;
            onRecurringChange(!isRecurring);
          }}
          sx={{
            flexDirection: "column",
            gap: 0.5,
            py: 1.25,
            px: 0.5,
            textTransform: "none",
            color: GARDEN_TOKENS.ink,
            minWidth: 0,
            overflow: "hidden",
            border: `2px solid ${GARDEN_TOKENS.ink} !important`,
            borderRadius: "10px !important",
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
          <SyncIcon fontSize="small" />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              lineHeight: 1.2,
              overflowWrap: "anywhere",
              textAlign: "center",
            }}
          >
            Recurring
          </Typography>
        </ToggleButton>
      </Box>
      {timingMode === "poll" ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
          Recurring is unavailable while Poll is selected.
        </Typography>
      ) : null}
      {isRecurring && timingMode !== "poll" ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
          Recurring combines with {timingMode === "allDay" ? "All Day" : "Window"} — configure
          pattern below the date fields.
        </Typography>
      ) : null}
    </Box>
  );
}

/** @deprecated Use timingModeFromFlags. */
export function scheduleModeFromFlags(input: {
  allDay: boolean;
  isPoll: boolean;
  isRecurring: boolean;
}): DraftTimingMode {
  return timingModeFromFlags(input);
}

/** @deprecated Use flagsFromTimingMode. */
export function flagsFromScheduleMode(mode: DraftScheduleMode): {
  allDay: boolean;
  isPoll: boolean;
  isRecurring: boolean;
} {
  if (mode === "recurring") {
    return { allDay: false, isPoll: false, isRecurring: true };
  }
  return { ...flagsFromTimingMode(mode), isRecurring: false };
}
