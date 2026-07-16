"use client";

import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import {
  Alert,
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
import { useEffect, useState, useTransition, type MouseEvent } from "react";

import { respondPartnershipAction } from "@/actions/partnerships";
import { respondResidencyAction } from "@/actions/places";
import {
  castProposalVoteAction,
  respondAttendeeUpdateAction,
} from "@/actions/proposals";
import { buildProposalNotificationDetail } from "@/lib/notifications-detail";
import { isActionableProposalNotification } from "@/lib/notifications-inbox";
import { RESIDENCY_CARD_PREFIX } from "@/lib/proposals/constants";
import {
  clearAllNotificationsAction,
  dismissNotificationAction,
  type NotificationItem,
} from "@/actions/notifications";
import { EmptyState } from "@/components/ui/EmptyState";
import { brutalPopoverPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

function formatNotificationType(type: string): string {
  return type.replaceAll("_", " ");
}

function isProposalOpenAction(
  type: string,
  proposalId: string | null,
  residencyId: string | null,
): boolean {
  if (residencyId) return true;
  if (!proposalId) return false;
  return type.startsWith("proposal") || type.includes("proposal") || type.startsWith("residency");
}

/**
 * True when the signed-in recipient can accept (vote) directly from the inbox.
 * These notifications are only delivered to invitees who still need to respond.
 */
function canAcceptFromNotification(
  type: string,
  proposalId: string | null,
  metadata: Record<string, unknown>,
): boolean {
  if (!proposalId) return false;
  if (type === "proposal_submitted") return true;
  return metadata.action === "vote";
}

/**
 * Header notification bell with dismissible inbox popover (PC-40, PC-43, PC-218).
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Keep local inbox aligned with RSC props after router.refresh() (PC-218).
  useEffect(() => {
    setItems(initialItems);
    setCount(initialCount);
  }, [initialItems, initialCount]);

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

  /**
   * Removes every actionable inbox row for a proposal (server also soft-dismisses
   * them all — local state must not leave stale Accept rows after vote).
   */
  function removeActionableForProposal(proposalId: string) {
    setItems((current) => {
      const next = current.filter((item) => {
        const rowProposalId =
          typeof item.metadata.proposalId === "string" ? item.metadata.proposalId : null;
        if (rowProposalId !== proposalId) return true;
        return !isActionableProposalNotification(item.type, item.metadata);
      });
      const removed = current.length - next.length;
      if (removed > 0) {
        setCount((c) => Math.max(0, c - removed));
      }
      return next;
    });
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

  function voteFromInbox(proposalId: string, vote: "accept" | "decline") {
    startTransition(async () => {
      const result = await castProposalVoteAction({ proposalId, vote });
      setFeedback(result.message);
      if (!result.ok) return;
      // Server dismissNotificationsForProposal already cleared durable rows.
      removeActionableForProposal(proposalId);
      router.refresh();
    });
  }

  function respondToResidency(logId: number, residencyId: string, accept: boolean) {
    startTransition(async () => {
      const result = await respondResidencyAction({ residencyId, accept });
      if (!result.ok) return;
      // Persist dismiss so SSR props after refresh stay clear (PC-218).
      await dismissNotificationAction(logId);
      removeFromList(logId);
      router.refresh();
    });
  }

  function respondToPartnership(logId: number, partnershipId: string, accept: boolean) {
    startTransition(async () => {
      const result = await respondPartnershipAction({ partnershipId, accept });
      if (!result.ok) return;
      await dismissNotificationAction(logId);
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
      removeActionableForProposal(proposalId);
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
        slotProps={{ paper: { sx: { ...brutalPopoverPaperSx, width: 360, maxWidth: "95vw" } } }}
      >
        <Box data-testid="notifications-panel">
        <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{ flexGrow: 1, fontFamily: fontFamilies.display, fontWeight: 700 }}
          >
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
        {feedback && (
          <Alert
            severity="info"
            onClose={() => setFeedback(null)}
            sx={{ mx: 1.5, mt: 1 }}
          >
            {feedback}
          </Alert>
        )}
        {items.length === 0 ? (
          <EmptyState
            title="All caught up"
            description="No new notifications right now."
            compact
            data-testid="notifications-empty"
          />
        ) : (
          <List dense disablePadding sx={{ maxHeight: 360, overflow: "auto", px: 1.5, pb: 1 }}>
            {items.map((item) => {
              const partnershipId =
                typeof item.metadata.partnershipId === "string"
                  ? item.metadata.partnershipId
                  : null;
              const residencyId =
                typeof item.metadata.residencyId === "string"
                  ? item.metadata.residencyId
                  : null;
              const proposalId =
                typeof item.metadata.proposalId === "string"
                  ? item.metadata.proposalId
                  : null;
              const showOpenProposal =
                isProposalOpenAction(item.type, proposalId, residencyId) &&
                item.type !== "proposal_attendee_update";
              const openTarget = residencyId
                ? `${RESIDENCY_CARD_PREFIX}${residencyId}`
                : proposalId;
              const showAccept = canAcceptFromNotification(
                item.type,
                proposalId,
                item.metadata,
              );
              const detail = buildProposalNotificationDetail(item.metadata);

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
                  sx={{
                    alignItems: "flex-start",
                    py: 1.5,
                    flexDirection: "column",
                    mb: 1,
                    mx: 0,
                    border: `2px solid ${GARDEN_TOKENS.ink}`,
                    borderRadius: "16px 6px 14px 8px",
                    bgcolor: GARDEN_TOKENS.surface,
                  }}
                >
                  <ListItemText
                    primary={item.message}
                    secondary={
                      <>
                        {detail && (
                          <Typography
                            component="span"
                            variant="caption"
                            display="block"
                            sx={{ fontWeight: 600, mb: 0.25 }}
                          >
                            {detail}
                          </Typography>
                        )}
                        <Typography component="span" variant="caption" display="block">
                          {formatNotificationType(item.type)} ·{" "}
                          {new Date(item.createdAt).toLocaleString()}
                        </Typography>
                      </>
                    }
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                  <Stack direction="row" spacing={1} sx={{ mt: 1, pr: 4 }} flexWrap="wrap" useFlexGap>
                    {item.type === "residency_proposed" && residencyId && (
                      <>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={pending}
                          onClick={() => respondToResidency(item.id, residencyId, false)}
                        >
                          Decline
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={pending}
                          onClick={() => respondToResidency(item.id, residencyId, true)}
                        >
                          Accept
                        </Button>
                      </>
                    )}
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
                    {showAccept && proposalId && (
                      <>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={pending}
                          onClick={() => voteFromInbox(proposalId, "decline")}
                        >
                          Decline
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={pending}
                          onClick={() => voteFromInbox(proposalId, "accept")}
                        >
                          Accept
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
                        Open Notification
                      </Button>
                    )}
                  </Stack>
                </ListItem>
              );
            })}
          </List>
        )}
        </Box>
      </Popover>
    </>
  );
}
