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
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";

import { respondPartnershipAction } from "@/actions/partnerships";
import { respondAttendeeUpdateAction } from "@/actions/proposals";
import {
  clearAllNotificationsAction,
  dismissNotificationAction,
  type NotificationItem,
} from "@/actions/notifications";

function formatNotificationType(type: string): string {
  return type.replaceAll("_", " ");
}

function isProposalOpenAction(type: string, proposalId: string | null): boolean {
  if (!proposalId) return false;
  return type.startsWith("proposal") || type.includes("proposal");
}

/**
 * Header notification bell with dismissible inbox popover (PC-40, PC-43).
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

  function removeFromList(logId: number) {
    setItems((current) => current.filter((item) => item.id !== logId));
    setCount((current) => Math.max(0, current - 1));
  }

  function dismissOne(logId: number) {
    startTransition(async () => {
      const result = await dismissNotificationAction(logId);
      if (!result.ok) return;
      removeFromList(logId);
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

  function openProposalTarget(
    logId: number,
    openTarget: string,
  ) {
    startTransition(async () => {
      const result = await dismissNotificationAction(logId);
      if (!result.ok) return;
      removeFromList(logId);
      handleClose();
      router.push(`/proposals?open=${encodeURIComponent(openTarget)}`);
      router.refresh();
    });
  }

  function respondToPartnership(logId: number, partnershipId: string, accept: boolean) {
    startTransition(async () => {
      const result = await respondPartnershipAction({ partnershipId, accept });
      if (!result.ok) return;
      removeFromList(logId);
      router.refresh();
    });
  }

  function respondToAttendeeUpdate(logId: number, proposalId: string, maintain: boolean) {
    startTransition(async () => {
      const result = await respondAttendeeUpdateAction({
        proposalId,
        response: maintain ? "maintain" : "decline",
      });
      if (!result.ok) return;
      removeFromList(logId);
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
            {items.map((item) => {
              const partnershipId =
                typeof item.metadata.partnershipId === "string"
                  ? item.metadata.partnershipId
                  : null;
              const proposalId =
                typeof item.metadata.proposalId === "string"
                  ? item.metadata.proposalId
                  : null;
              const showOpenProposal =
                isProposalOpenAction(item.type, proposalId) &&
                item.type !== "proposal_attendee_update";
              const openTarget = proposalId;

              return (
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
                  sx={{ alignItems: "flex-start", py: 1.5, flexDirection: "column" }}
                >
                  <ListItemText
                    primary={item.message}
                    secondary={
                      <Typography component="span" variant="caption" display="block">
                        {formatNotificationType(item.type)} ·{" "}
                        {new Date(item.createdAt).toLocaleString()}
                      </Typography>
                    }
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                  <Stack direction="row" spacing={1} sx={{ mt: 1, pr: 4 }} flexWrap="wrap" useFlexGap>
                    {item.type === "partnership_proposed" && partnershipId && (
                      <>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={pending}
                          onClick={() => respondToPartnership(item.id, partnershipId, false)}
                        >
                          Decline
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={pending}
                          onClick={() => respondToPartnership(item.id, partnershipId, true)}
                        >
                          Accept
                        </Button>
                      </>
                    )}
                    {item.type === "proposal_attendee_update" && proposalId && (
                      <>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={pending}
                          onClick={() => respondToAttendeeUpdate(item.id, proposalId, false)}
                        >
                          Decline
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={pending}
                          onClick={() => respondToAttendeeUpdate(item.id, proposalId, true)}
                        >
                          Maintain accept
                        </Button>
                      </>
                    )}
                    {showOpenProposal && openTarget && (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={pending}
                        onClick={() => openProposalTarget(item.id, openTarget)}
                      >
                        Open Proposal
                      </Button>
                    )}
                  </Stack>
                </ListItem>
              );
            })}
          </List>
        )}
      </Popover>
    </>
  );
}
