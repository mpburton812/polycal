"use client";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import FeedbackIcon from "@mui/icons-material/Feedback";
import LogoutIcon from "@mui/icons-material/Logout";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  AppBar,
  Box,
  CircularProgress,
  FormControl,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Toolbar,
  Typography,
} from "@mui/material";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";

import type { NotificationItem } from "@/actions/notifications";
import { listMyNetworksAction } from "@/actions/networks";
import { useFeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { NotificationInbox } from "@/components/layout/NotificationInbox";
import { OrganicAvatar } from "@/components/ui/OrganicAvatar";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Primary app chrome — cream surface, ink borders, blob avatar (Garden Brutalism).
 * Network switcher updates the JWT activeNetworkId (PC-359).
 */
export function AppHeader({
  displayName,
  groupName,
  notificationCount = 0,
  notificationItems = [],
  avatarSrc,
  isPlatformAdmin = false,
  canSeeAdmin = false,
}: {
  displayName: string;
  groupName: string;
  notificationCount?: number;
  notificationItems?: NotificationItem[];
  avatarSrc?: string;
  isPlatformAdmin?: boolean;
  /** Network / legacy / platform admins — Admin lives in this menu (PC-393). */
  canSeeAdmin?: boolean;
}) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const profileOpen = Boolean(profileAnchor);
  const [networks, setNetworks] = useState<
    { networkId: string; name: string; role: string; status: string }[]
  >([]);
  const { capturing, openDialog: openFeedback, dialog: feedbackDialog } = useFeedbackDialog();

  useEffect(() => {
    void listMyNetworksAction().then(setNetworks);
  }, [session?.user?.activeNetworkId]);

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

  function goToPlatformAdmin() {
    closeProfileMenu();
    router.push("/platform-admin");
  }

  function goToAdmin() {
    closeProfileMenu();
    router.push("/admin");
  }

  function logout() {
    closeProfileMenu();
    void signOut({ callbackUrl: "/login" });
  }

  async function onSwitchNetwork(networkId: string) {
    const target = networks.find((n) => n.networkId === networkId);
    await update({
      user: {
        activeNetworkId: networkId,
        activeNetworkRole: target?.role as
          | "network_admin"
          | "user"
          | "passive"
          | undefined,
      },
    });
    router.refresh();
  }

  const activeId =
    session?.user?.activeNetworkId ?? networks[0]?.networkId ?? "";

  return (
    <>
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
            alignItems: "center",
            gap: 1,
            pr: 1,
          }}
        >
          {networks.length > 1 ? (
            <FormControl size="small" sx={{ minWidth: 120, maxWidth: 180 }}>
              <Select
                value={activeId}
                onChange={(e) => void onSwitchNetwork(String(e.target.value))}
                aria-label="Switch network"
                sx={{
                  fontFamily: fontFamilies.display,
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  ".MuiOutlinedInput-notchedOutline": { borderColor: GARDEN_TOKENS.ink },
                }}
              >
                {networks.map((n) => (
                  <MenuItem key={n.networkId} value={n.networkId}>
                    {n.name}
                    {n.status === "paused" ? " (paused)" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Typography
              variant="h6"
              component="div"
              noWrap
              sx={{ fontFamily: fontFamilies.display, fontSize: "1.05rem", fontWeight: 700 }}
            >
              {groupName}
            </Typography>
          )}
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
          {isPlatformAdmin && (
            <MenuItem onClick={goToPlatformAdmin}>
              <ListItemIcon>
                <AdminPanelSettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Platform admin</ListItemText>
            </MenuItem>
          )}
          {canSeeAdmin && (
            <MenuItem onClick={goToAdmin}>
              <ListItemIcon>
                <AdminPanelSettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Admin</ListItemText>
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              closeProfileMenu();
              void openFeedback();
            }}
            disabled={capturing}
          >
            <ListItemIcon>
              {capturing ? (
                <CircularProgress size={18} />
              ) : (
                <FeedbackIcon fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText>Feedback</ListItemText>
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
    {feedbackDialog}
    </>
  );
}
