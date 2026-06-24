"use client";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import {
  AppBar,
  Avatar,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import Link from "next/link";

import type { NotificationItem } from "@/actions/notifications";
import { NotificationInbox } from "@/components/layout/NotificationInbox";

/**
 * Primary app chrome — calendar branding left, alerts + profile right (spec §1).
 */
export function AppHeader({
  displayName,
  notificationCount = 0,
  notificationItems = [],
  avatarSrc,
}: {
  displayName: string;
  notificationCount?: number;
  notificationItems?: NotificationItem[];
  avatarSrc?: string;
}) {
  return (
    <AppBar position="static" color="primary" elevation={1}>
      <Toolbar>
        <CalendarMonthIcon sx={{ mr: 1 }} aria-hidden />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          PolyCal
        </Typography>
        <NotificationInbox initialCount={notificationCount} initialItems={notificationItems} />
        <IconButton
          color="inherit"
          component={Link}
          href="/profile"
          aria-label={`Profile for ${displayName}`}
        >
          <Avatar
            src={avatarSrc}
            alt=""
            sx={{ width: 32, height: 32, bgcolor: "primary.dark" }}
          >
            {displayName.charAt(0)}
          </Avatar>
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
