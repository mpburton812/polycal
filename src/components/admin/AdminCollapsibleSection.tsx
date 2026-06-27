"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Collapse, IconButton, Paper, Stack, Typography } from "@mui/material";
import { useId, useState, type ReactNode } from "react";

interface AdminCollapsibleSectionProps {
  title: string;
  children: ReactNode;
  /** Optional controls shown in the header row (e.g. Export). */
  headerAction?: ReactNode;
}

/**
 * Collapsible admin section — collapsed by default with a chevron toggle (PC-47).
 */
export function AdminCollapsibleSection({
  title,
  children,
  headerAction,
}: AdminCollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  function toggle() {
    setExpanded((current) => !current);
  }

  return (
    <Paper sx={{ overflow: "hidden" }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={panelId}
        sx={{ px: 2, py: 1.5, cursor: "pointer", userSelect: "none" }}
      >
        <Typography variant="h6" component="h2" sx={{ flex: 1 }}>
          {title}
        </Typography>
        {headerAction}
        <IconButton
          size="small"
          aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          sx={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <ExpandMoreIcon />
        </IconButton>
      </Stack>
      <Collapse in={expanded}>
        <Box id={panelId} sx={{ px: 3, pb: 3, pt: 0 }}>
          {children}
        </Box>
      </Collapse>
    </Paper>
  );
}
