"use client";

import {
  Avatar,
  Box,
  ButtonBase,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState, useTransition } from "react";

import { listFeedLikersAction, toggleFeedLikeAction } from "@/actions/feed";
import { avatarSrcForKey } from "@/lib/constants/avatars";
import type { FeedLikeTargetType, FeedLiker } from "@/lib/feed/likes";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Parrot like control under a feed box — grey → green toggle + likers popup (PC-239).
 */
export function FeedLikeControl({
  targetType,
  targetId,
  likeCount,
  likedByMe,
  onChanged,
}: {
  targetType: FeedLikeTargetType;
  targetId: string;
  likeCount: number;
  likedByMe: boolean;
  onChanged?: (next: { likeCount: number; likedByMe: boolean }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(likeCount);
  const [liked, setLiked] = useState(likedByMe);
  const [likersOpen, setLikersOpen] = useState(false);
  const [likers, setLikers] = useState<FeedLiker[]>([]);
  const [loadingLikers, setLoadingLikers] = useState(false);

  // Keep local state in sync when parent reloads the feed.
  useEffect(() => {
    setCount(likeCount);
    setLiked(likedByMe);
  }, [likeCount, likedByMe]);

  function toggle() {
    startTransition(async () => {
      const result = await toggleFeedLikeAction({ targetType, targetId });
      if (!result.ok || result.likeCount === undefined || result.likedByMe === undefined) {
        return;
      }
      setCount(result.likeCount);
      setLiked(result.likedByMe);
      onChanged?.({ likeCount: result.likeCount, likedByMe: result.likedByMe });
    });
  }

  async function openLikers() {
    if (count === 0) return;
    setLikersOpen(true);
    setLoadingLikers(true);
    const result = await listFeedLikersAction({ targetType, targetId });
    setLoadingLikers(false);
    if (result.ok && result.likers) {
      setLikers(result.likers);
    } else {
      setLikers([]);
    }
  }

  const parrotSrc = liked ? "/avatars/bird_green.png" : "/avatars/bird_blue.png";

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1, justifyContent: "flex-start" }}>
        <ButtonBase
          onClick={toggle}
          disabled={pending}
          aria-label={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
          data-testid={`feed-like-${targetType}-${targetId}`}
          sx={{
            borderRadius: 1,
            p: 0.25,
            lineHeight: 0,
            filter: liked ? "none" : "grayscale(1) brightness(0.85)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={parrotSrc} alt="" width={28} height={28} style={{ display: "block" }} />
        </ButtonBase>
        <ButtonBase
          onClick={() => void openLikers()}
          disabled={count === 0}
          aria-label={`${count} likes — show who liked`}
          data-testid={`feed-like-count-${targetType}-${targetId}`}
          sx={{
            borderRadius: 1,
            px: 0.5,
            minWidth: 24,
            color: GARDEN_TOKENS.ink,
            fontWeight: 700,
            fontSize: "0.95rem",
          }}
        >
          {count}
        </ButtonBase>
      </Stack>

      <Dialog open={likersOpen} onClose={() => setLikersOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Liked by</DialogTitle>
        <DialogContent>
          {loadingLikers ? (
            <Typography color="text.secondary">Loading…</Typography>
          ) : likers.length === 0 ? (
            <Typography color="text.secondary">No likes yet.</Typography>
          ) : (
            <List dense>
              {likers.map((liker) => (
                <ListItem key={liker.userId} disableGutters>
                  <ListItemAvatar>
                    <Avatar
                      src={avatarSrcForKey(liker.avatarKey) ?? undefined}
                      alt={liker.displayName}
                      sx={{ width: 36, height: 36 }}
                    />
                  </ListItemAvatar>
                  <ListItemText
                    primary={liker.displayName}
                    secondary={new Date(liker.likedAt).toLocaleString()}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Spacer so like control sits flush under the card content. */
export function FeedLikeRow(props: Parameters<typeof FeedLikeControl>[0]) {
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
      <FeedLikeControl {...props} />
    </Box>
  );
}
