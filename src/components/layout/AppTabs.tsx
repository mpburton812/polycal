"use client";

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
import type { ElementType } from "react";

import { BOTTOM_NAV_ICON_PX } from "@/components/feed/feedIconSizes";
import { MAIN_TAB_HREFS } from "@/components/layout/mainTabs";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

const FEED_TAB_HREF = "/feed" as const;

type TabMeta = {
  label: string;
  icon?: ElementType;
};

const tabMeta: Record<(typeof MAIN_TAB_HREFS)[number], TabMeta> = {
  "/feed": { label: "Feed" },
  "/schedule": { label: "Schedule", icon: EventNoteIcon },
  "/proposals": { label: "Proposals", icon: HowToVoteIcon },
  "/people-places": { label: "People & Places", icon: GroupsIcon },
};

/**
 * Feed tab parrot sized to match sibling MUI bottom-nav icons (PC-270).
 */
function FeedParrotIcon({ selected }: { selected: boolean }) {
  return (
    // Decorative; BottomNavigationAction label provides accessible name.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={selected ? "/avatars/bird_green.png" : "/avatars/bird_blue.png"}
      width={BOTTOM_NAV_ICON_PX}
      height={BOTTOM_NAV_ICON_PX}
      alt=""
      style={{ display: "block" }}
    />
  );
}

/**
 * Bottom tab navigation with ink border and flat fill (Garden Brutalism).
 */
export function AppTabs({
  isAdmin,
  feedEnabled = true,
}: {
  isAdmin: boolean;
  feedEnabled?: boolean;
}) {
  const pathname = usePathname();
  const visibleTabs = MAIN_TAB_HREFS.filter((href) => {
    if (!feedEnabled && href === "/feed") return false;
    return true;
  }).map((href) => ({ href, ...tabMeta[href] }));

  const current =
    visibleTabs.find((t) => pathname.startsWith(t.href))?.href ??
    visibleTabs[0]?.href ??
    "/schedule";

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
          const isFeed = tab.href === FEED_TAB_HREF;
          const Icon = tab.icon;
          return (
            <BottomNavigationAction
              key={tab.href}
              label={tab.label}
              value={tab.href}
              icon={
                isFeed ? (
                  <FeedParrotIcon selected={current === FEED_TAB_HREF} />
                ) : Icon ? (
                  <Icon />
                ) : undefined
              }
              component={Link}
              href={tab.href}
            />
          );
        })}
      </BottomNavigation>
    </Paper>
  );
}
