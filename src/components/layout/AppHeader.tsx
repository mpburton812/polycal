"use client";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import {
  AppBar,
  Avatar,
  Badge,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import Link from "next/link";

/**
 * Primary app chrome — calendar branding left, alerts + profile right (spec §1).
 */
export function AppHeader({
  displayName,
  notificationCount = 0,
  avatarSrc,
}: {
  displayName: string;
  notificationCount?: number;
  avatarSrc?: string;
}) {
  return (
    <AppBar position="static" color="primary">
      <Toolbar>
        <CalendarMonthIcon sx={{ mr: 1 }} aria-hidden />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          PolyCal
        </Typography>
        <IconButton
          color="inherit"
          aria-label={
            notificationCount > 0
              ? `${notificationCount} notifications`
              : "Notifications"
          }
        >
          <Badge badgeContent={notificationCount} color="error">
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
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
