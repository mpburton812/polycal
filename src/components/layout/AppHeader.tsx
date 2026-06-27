"use client";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LogoutIcon from "@mui/icons-material/Logout";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  AppBar,
  Avatar,
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from "@mui/material";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";

import type { NotificationItem } from "@/actions/notifications";
import { NotificationInbox } from "@/components/layout/NotificationInbox";

/**
 * Primary app chrome — group name + PolyCal branding, alerts, and profile menu.
 */
export function AppHeader({
  displayName,
  groupName,
  notificationCount = 0,
  notificationItems = [],
  avatarSrc,
}: {
  displayName: string;
  groupName: string;
  notificationCount?: number;
  notificationItems?: NotificationItem[];
  avatarSrc?: string;
}) {
  const router = useRouter();
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const profileOpen = Boolean(profileAnchor);

  function openProfileMenu(event: MouseEvent<HTMLElement>) {
    setProfileAnchor(event.currentTarget);
  }

  function closeProfileMenu() {
    setProfileAnchor(null);
  }

  function goToSettings() {
    closeProfileMenu();
    router.push("/profile");
  }

  function logout() {
    closeProfileMenu();
    void signOut({ callbackUrl: "/login" });
  }

  return (
    <AppBar position="static" color="primary" elevation={1}>
      <Toolbar sx={{ gap: 1 }}>
        <CalendarMonthIcon aria-hidden />
        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "baseline",
            gap: 0.75,
            pr: 1,
            maskImage: "linear-gradient(90deg, #000 78%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(90deg, #000 78%, transparent 100%)",
          }}
        >
          <Typography variant="h6" component="div" noWrap sx={{ fontSize: "1.05rem" }}>
            {groupName}
          </Typography>
          <Typography variant="h6" component="span" noWrap sx={{ fontSize: "1.05rem", opacity: 0.92 }}>
            PolyCal
          </Typography>
        </Box>
        <NotificationInbox initialCount={notificationCount} initialItems={notificationItems} />
        <IconButton
          color="inherit"
          aria-label={`Profile menu for ${displayName}`}
          aria-haspopup="true"
          aria-expanded={profileOpen}
          onClick={openProfileMenu}
        >
          <Avatar
            src={avatarSrc}
            alt=""
            sx={{ width: 32, height: 32, bgcolor: "primary.dark" }}
          >
            {displayName.charAt(0)}
          </Avatar>
        </IconButton>
        <Menu
          anchorEl={profileAnchor}
          open={profileOpen}
          onClose={closeProfileMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem onClick={goToSettings}>
            <ListItemIcon>
              <SettingsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Settings</ListItemText>
          </MenuItem>
          <MenuItem onClick={logout}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Logout</ListItemText>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
