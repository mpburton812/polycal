"use client";

import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import EventNoteIcon from "@mui/icons-material/EventNote";
import GroupsIcon from "@mui/icons-material/Groups";
import HowToVoteIcon from "@mui/icons-material/HowToVote";
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MAIN_TAB_HREFS } from "@/components/layout/mainTabs";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

const tabMeta = {
  "/schedule": { label: "Schedule", icon: EventNoteIcon },
  "/proposals": { label: "Proposals", icon: HowToVoteIcon },
  "/people-places": { label: "People & Places", icon: GroupsIcon },
  "/admin": { label: "Admin", icon: AdminPanelSettingsIcon },
} as const;

/**
 * Bottom tab navigation with ink border and flat fill (Garden Brutalism).
 */
export function AppTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const visibleTabs = MAIN_TAB_HREFS.filter(
    (href) => isAdmin || href !== "/admin",
  ).map((href) => ({ href, ...tabMeta[href] }));

  const current =
    visibleTabs.find((t) => pathname.startsWith(t.href))?.href ?? "/schedule";

  return (
    <Paper
      component="nav"
      aria-label="Main navigation"
      elevation={0}
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        bgcolor: GARDEN_TOKENS.surface,
        borderTop: `3px solid ${GARDEN_TOKENS.ink}`,
        borderRadius: 0,
        boxShadow: "none",
      }}
    >
      <BottomNavigation
        value={current}
        showLabels
        sx={{
          bgcolor: "transparent",
          "& .MuiBottomNavigationAction-root": {
            fontFamily: fontFamilies.label,
            fontWeight: 600,
            fontSize: "0.7rem",
            color: GARDEN_TOKENS.inkMuted,
            minWidth: 0,
            "&.Mui-selected": {
              color: GARDEN_TOKENS.sage,
            },
          },
        }}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <BottomNavigationAction
              key={tab.href}
              label={tab.label}
              value={tab.href}
              icon={<Icon />}
              component={Link}
              href={tab.href}
            />
          );
        })}
      </BottomNavigation>
    </Paper>
  );
}
