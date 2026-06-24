"use client";

import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";

import {
  clearAllNotificationsAction,
  dismissNotificationAction,
  type NotificationItem,
} from "@/actions/notifications";

/**
 * Header notification bell with dismissible inbox popover (PC-40).
 */
export function NotificationInbox({
  initialCount,
  initialItems,
}: {
  initialCount: number;
  initialItems: NotificationItem[];
}) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [items, setItems] = useState(initialItems);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  const open = Boolean(anchorEl);

  function handleOpen(event: MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
  }

  function dismissOne(logId: number) {
    startTransition(async () => {
      const result = await dismissNotificationAction(logId);
      if (!result.ok) return;
      setItems((current) => current.filter((item) => item.id !== logId));
      setCount((current) => Math.max(0, current - 1));
      router.refresh();
    });
  }

  function clearAll() {
    startTransition(async () => {
      const result = await clearAllNotificationsAction();
      if (!result.ok) return;
      setItems([]);
      setCount(0);
      router.refresh();
    });
  }

  return (
    <>
      <IconButton
        color="inherit"
        aria-label={count > 0 ? `${count} notifications` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={handleOpen}
      >
        <Badge badgeContent={count} color="error">
          <NotificationsNoneIcon />
        </Badge>
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: "95vw" } } }}
      >
        <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
            Notifications
          </Typography>
          {items.length > 0 && (
            <Button size="small" onClick={clearAll} disabled={pending}>
              Clear all
            </Button>
          )}
          <IconButton size="small" aria-label="Close notifications" onClick={handleClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Divider />
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No new notifications.
          </Typography>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 360, overflow: "auto" }}>
            {items.map((item) => (
              <ListItem
                key={item.id}
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    aria-label="Dismiss notification"
                    disabled={pending}
                    onClick={() => dismissOne(item.id)}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                }
                sx={{ alignItems: "flex-start", py: 1.5 }}
              >
                <ListItemText
                  primary={item.message}
                  secondary={new Date(item.createdAt).toLocaleString()}
                  primaryTypographyProps={{ variant: "body2" }}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
}
