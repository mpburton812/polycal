"use client";

import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";

import type { SchedulePlanningItem } from "@/actions/schedule";

interface PlanningModeDrawerProps {
  open: boolean;
  items: SchedulePlanningItem[];
  eventIdsOnCalendar?: Set<string>;
  onClose: () => void;
  onSelect: (proposalId: string) => void;
}

const STATE_LABEL: Record<string, string> = {
  draft: "Draft",
  proposed: "Proposed",
  resolved: "Resolved",
};

/**
 * Sidebar list of accessible proposals for planning without cluttering the grid (PC-42).
 */
export function PlanningModeDrawer({
  open,
  items,
  eventIdsOnCalendar,
  onClose,
  onSelect,
}: PlanningModeDrawerProps) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 320 } }}>
      <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1.5 }}>
        <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
          Planning mode
        </Typography>
        <IconButton aria-label="Close planning mode" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1 }}>
        Drafts, proposed, and resolved items you can access. Tap to open details.
      </Typography>
      <List dense>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
            No proposals in planning view.
          </Typography>
        ) : (
          items.map((item) => {
            const onCalendar = eventIdsOnCalendar?.has(item.id) ?? true;
            const secondary =
              `${STATE_LABEL[item.state] ?? item.state} · ${item.proposalType}` +
              (!onCalendar && item.state === "resolved" ? " · Not on calendar" : "");

            return (
              <ListItemButton key={item.id} onClick={() => onSelect(item.id)}>
                <ListItemText primary={item.title} secondary={secondary} />
                <StackedChips state={item.state} onCalendar={onCalendar} />
              </ListItemButton>
            );
          })
        )}
      </List>
    </Drawer>
  );
}

function StackedChips({ state, onCalendar }: { state: string; onCalendar: boolean }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "flex-end" }}>
      <Chip size="small" label={STATE_LABEL[state] ?? state} />
      {!onCalendar && state === "resolved" ? (
        <Chip size="small" color="warning" variant="outlined" label="Not on calendar" />
      ) : null}
    </Box>
  );
}
