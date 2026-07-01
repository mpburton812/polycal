"use client";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LogoutIcon from "@mui/icons-material/Logout";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  AppBar,
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
import { OrganicAvatar } from "@/components/ui/OrganicAvatar";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Primary app chrome — cream surface, ink borders, blob avatar (Garden Brutalism).
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
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: GARDEN_TOKENS.surface,
        color: GARDEN_TOKENS.ink,
        borderBottom: `3px solid ${GARDEN_TOKENS.ink}`,
        backgroundImage: "none",
      }}
    >
      <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 } }}>
        <CalendarMonthIcon aria-hidden sx={{ color: GARDEN_TOKENS.sage, flexShrink: 0 }} />
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
          <Typography
            variant="h6"
            component="div"
            noWrap
            sx={{ fontFamily: fontFamilies.display, fontSize: "1.05rem", fontWeight: 700 }}
          >
            {groupName}
          </Typography>
          <Typography
            variant="h6"
            component="span"
            noWrap
            sx={{
              fontFamily: fontFamilies.label,
              fontSize: "0.95rem",
              fontWeight: 600,
              color: GARDEN_TOKENS.inkMuted,
            }}
          >
            PolyCal
          </Typography>
        </Box>
        <NotificationInbox initialCount={notificationCount} initialItems={notificationItems} />
        <IconButton
          aria-label={`Profile menu for ${displayName}`}
          aria-haspopup="true"
          aria-expanded={profileOpen}
          onClick={openProfileMenu}
          sx={{
            color: GARDEN_TOKENS.ink,
            p: 0.5,
            "&:hover": { bgcolor: GARDEN_TOKENS.background },
          }}
        >
          <OrganicAvatar src={avatarSrc} alt="" label={displayName} size={32} />
        </IconButton>
        <Menu
          anchorEl={profileAnchor}
          open={profileOpen}
          onClose={closeProfileMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: {
              sx: {
                border: `2px solid ${GARDEN_TOKENS.ink}`,
                boxShadow: "none",
                bgcolor: GARDEN_TOKENS.surface,
              },
            },
          }}
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
