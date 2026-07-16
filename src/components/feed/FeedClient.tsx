"use client";

import dynamic from "next/dynamic";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  deleteNetworkChatCommentAction,
  deleteNetworkChatMessageAction,
  getFeedUpdateTokenAction,
  listFeedItemsAction,
  postNetworkChatCommentAction,
  postNetworkChatMessageAction,
  uploadFeedImageAction,
} from "@/actions/feed";
import {
  addProposalCommentAction,
  deleteProposalCommentAction,
} from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { FeedLikeRow } from "@/components/feed/FeedLikeControl";
import { feedImageUrl, MAX_FEED_IMAGES } from "@/lib/feed/images";
import type { FeedLikeTargetType } from "@/lib/feed/likes";
import type { FeedComment, FeedItem } from "@/lib/feed/types";
import { buildFeedUpdateToken } from "@/lib/feed/update-token";
import { handleCommentEnterKey } from "@/lib/ui/comment-keydown";
import { brutalPageTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

const ProposalDetailDialog = dynamic(
  () =>
    import("@/components/proposals/ProposalDetailDialog").then((mod) => ({
      default: mod.ProposalDetailDialog,
    })),
  { ssr: false },
);

const MILESTONE_RAIL = "#2d6a4f";
const CHAT_RAIL = "#1d4e89";

function FeedImageStrip({
  imageIds,
  onOpen,
}: {
  imageIds: string[];
  onOpen: (imageIds: string[], index: number) => void;
}) {
  if (imageIds.length === 0) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
      {imageIds.map((id, index) => (
        <Box
          key={id}
          component="button"
          type="button"
          onClick={() => onOpen(imageIds, index)}
          sx={{
            border: `2px solid ${GARDEN_TOKENS.ink}`,
            p: 0,
            cursor: "pointer",
            bgcolor: "transparent",
            lineHeight: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={feedImageUrl(id)}
            alt="Feed attachment"
            style={{ height: 96, width: 96, objectFit: "cover", display: "block" }}
          />
        </Box>
      ))}
    </Stack>
  );
}

function CommentBlock({
  comment,
  commentTargetType,
  onDelete,
  onOpenImage,
  pending,
}: {
  comment: FeedComment;
  commentTargetType: Extract<FeedLikeTargetType, "chat_comment" | "proposal_comment">;
  onDelete: (id: string) => void;
  onOpenImage: (ids: string[], index: number) => void;
  pending: boolean;
}) {
  return (
    <Box sx={{ pl: 1, borderLeft: `2px solid ${GARDEN_TOKENS.inkMuted}` }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Typography variant="body2">
          <strong>{comment.authorName}</strong>
          {comment.body ? `: ${comment.body}` : ""}
        </Typography>
        {comment.canDelete ? (
          <IconButton
            aria-label="Delete comment"
            size="small"
            onClick={() => onDelete(comment.id)}
            disabled={pending}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        ) : null}
      </Stack>
      <FeedImageStrip imageIds={comment.imageIds} onOpen={onOpenImage} />
      <FeedLikeRow
        targetType={commentTargetType}
        targetId={comment.id}
        likeCount={comment.likeCount}
        likedByMe={comment.likedByMe}
      />
    </Box>
  );
}

/**
 * Unified Feed: milestones + chat in one timeline, Option A styling (PC-231).
 */
export function FeedClient({
  currentUserId,
  isAdmin,
  people,
}: {
  currentUserId: string;
  isAdmin: boolean;
  people: PersonSummary[];
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [pendingImages, setPendingImages] = useState<{ id: string; preview: string }[]>([]);
  const [pendingCommentImages, setPendingCommentImages] = useState<
    Record<string, { id: string; preview: string }[]>
  >({});
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileTargetRef = useRef<string | null>(null);
  const sendInFlightRef = useRef(false);
  /** Last known first-page fingerprint — skip silent reload when unchanged. */
  const updateTokenRef = useRef<string | null>(null);

  const loadFeed = useCallback(
    async (
      cursor?: string | null,
      options?: { append?: boolean; silent?: boolean },
    ) => {
      const append = options?.append ?? false;
      const silent = options?.silent ?? false;
      if (append) setLoadingMore(true);
      else if (!silent) setLoading(true);
      const result = await listFeedItemsAction({ cursor: cursor ?? null, limit: 20 });
      if (!result.ok || !result.items) {
        setError(result.message);
      } else {
        setItems((prev) => (append ? [...prev, ...result.items!] : result.items!));
        setNextCursor(result.nextCursor ?? null);
        if (!append) {
          updateTokenRef.current = buildFeedUpdateToken(result.items);
        }
      }
      if (!silent || append) {
        setLoading(false);
        setLoadingMore(false);
      } else {
        setLoadingMore(false);
      }
    },
    [],
  );

  /** Background head-check: leave the active list alone when nothing changed. */
  const pollFeedUpdates = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const head = await getFeedUpdateTokenAction();
    if (!head.ok || head.token === undefined) return;
    if (updateTokenRef.current !== null && head.token === updateTokenRef.current) {
      return;
    }
    await loadFeed(null, { silent: true });
  }, [loadFeed]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (pending || sending) return;
    const timer = window.setInterval(() => {
      void pollFeedUpdates();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [pollFeedUpdates, pending, sending]);

  function openDetail(proposalId: string) {
    setSelectedProposalId(proposalId);
    setDetailOpen(true);
  }

  async function uploadFiles(files: FileList | File[], targetKey?: string) {
    const key = targetKey ?? "__composer__";
    const existing =
      key === "__composer__"
        ? pendingImages.length
        : (pendingCommentImages[key]?.length ?? 0);
    const list = Array.from(files).slice(0, MAX_FEED_IMAGES - existing);
    for (const file of list) {
      const fd = new FormData();
      fd.append("image0", file);
      const result = await uploadFeedImageAction(fd);
      if (!result.ok || !result.imageId) {
        setError(result.message);
        return;
      }
      const preview = URL.createObjectURL(file);
      if (key === "__composer__") {
        setPendingImages((prev) => [...prev, { id: result.imageId!, preview }]);
      } else {
        setPendingCommentImages((prev) => ({
          ...prev,
          [key]: [...(prev[key] ?? []), { id: result.imageId!, preview }],
        }));
      }
    }
  }

  function clearCommentImages(key: string) {
    const imgs = pendingCommentImages[key] ?? [];
    imgs.forEach((p) => URL.revokeObjectURL(p.preview));
    setPendingCommentImages((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function postMilestoneComment(proposalId: string, draftKey: string) {
    const body = (commentDrafts[draftKey] ?? "").trim();
    const imageIds = (pendingCommentImages[draftKey] ?? []).map((p) => p.id);
    if (!body && imageIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await addProposalCommentAction({ proposalId, body, imageIds });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCommentDrafts((prev) => ({ ...prev, [draftKey]: "" }));
      clearCommentImages(draftKey);
      await loadFeed(null, { silent: true });
    });
  }

  function deleteMilestoneComment(commentId: string) {
    startTransition(async () => {
      const result = await deleteProposalCommentAction(commentId);
      if (!result.ok) setError(result.message);
      else await loadFeed(null, { silent: true });
    });
  }

  function sendChat() {
    const body = chatDraft.trim();
    if (!body && pendingImages.length === 0) return;
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setError(null);
    setSending(true);
    void (async () => {
      try {
        const result = await postNetworkChatMessageAction({
          body,
          imageIds: pendingImages.map((p) => p.id),
        });
        if (!result.ok) {
          setError(result.message || "Failed to send message.");
          return;
        }
        setChatDraft("");
        pendingImages.forEach((p) => URL.revokeObjectURL(p.preview));
        setPendingImages([]);
        if (result.item) {
          setItems((prev) => [{ kind: "chat", ...result.item! }, ...prev]);
          updateTokenRef.current = null;
        } else {
          await loadFeed(null, { silent: true });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message.");
      } finally {
        sendInFlightRef.current = false;
        setSending(false);
      }
    })();
  }

  function postChatComment(messageId: string) {
    const draftKey = `chat-${messageId}`;
    const body = (commentDrafts[draftKey] ?? "").trim();
    const imageIds = (pendingCommentImages[draftKey] ?? []).map((p) => p.id);
    if (!body && imageIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await postNetworkChatCommentAction({ messageId, body, imageIds });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCommentDrafts((prev) => ({ ...prev, [draftKey]: "" }));
      clearCommentImages(draftKey);
      await loadFeed(null, { silent: true });
    });
  }

  function deleteChat(messageId: string) {
    startTransition(async () => {
      const result = await deleteNetworkChatMessageAction(messageId);
      if (!result.ok) setError(result.message);
      else await loadFeed(null, { silent: true });
    });
  }

  function deleteChatComment(commentId: string) {
    startTransition(async () => {
      const result = await deleteNetworkChatCommentAction(commentId);
      if (!result.ok) setError(result.message);
      else await loadFeed(null, { silent: true });
    });
  }

  function renderItem(item: FeedItem) {
    if (item.kind === "milestone") {
      const draftKey = `ms-${item.proposalId}`;
      return (
        <Box
          key={`m-${item.id}`}
          sx={{
            border: `2px solid ${GARDEN_TOKENS.ink}`,
            borderLeft: `6px solid ${MILESTONE_RAIL}`,
            bgcolor: GARDEN_TOKENS.surface,
            p: 2,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
            <Chip size="small" label="Milestone" sx={{ fontWeight: 700 }} />
            <Chip size="small" label={item.proposalType === "sleeping" ? "Sleeping" : "Event"} />
            <Chip size="small" variant="outlined" label={item.proposalState} />
          </Stack>
          <Typography variant="subtitle1" fontWeight={700}>
            {item.proposalTitle}
          </Typography>
          <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted, mb: 1 }}>
            {item.headline}
          </Typography>
          <Button size="small" onClick={() => openDetail(item.proposalId)}>
            Open proposal
          </Button>
          <FeedLikeRow
            targetType="milestone"
            targetId={item.id}
            likeCount={item.likeCount}
            likedByMe={item.likedByMe}
          />

          {!item.masked && item.comments.length > 0 ? (
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              {item.comments.map((comment) => (
                <CommentBlock
                  key={comment.id}
                  comment={comment}
                  commentTargetType="proposal_comment"
                  pending={pending}
                  onDelete={deleteMilestoneComment}
                  onOpenImage={(ids, index) => setLightbox({ ids, index })}
                />
              ))}
            </Stack>
          ) : null}

          {item.canComment ? (
            <>
              {(pendingCommentImages[draftKey] ?? []).length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
                  {(pendingCommentImages[draftKey] ?? []).map((img) => (
                    <Box key={img.id} sx={{ position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.preview}
                        alt="Pending"
                        style={{ height: 48, width: 48, objectFit: "cover" }}
                      />
                    </Box>
                  ))}
                </Stack>
              ) : null}
              <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ mt: 1.5 }}>
                <IconButton
                  size="small"
                  aria-label="Attach to comment"
                  onClick={() => {
                    commentFileTargetRef.current = draftKey;
                    fileInputRef.current?.click();
                  }}
                  disabled={
                    pending || (pendingCommentImages[draftKey]?.length ?? 0) >= MAX_FEED_IMAGES
                  }
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={1}
                  maxRows={3}
                  placeholder="Comment on this milestone…"
                  value={commentDrafts[draftKey] ?? ""}
                  onChange={(e) =>
                    setCommentDrafts((prev) => ({ ...prev, [draftKey]: e.target.value }))
                  }
                  onKeyDown={(e) =>
                    handleCommentEnterKey(
                      e,
                      () => postMilestoneComment(item.proposalId, draftKey),
                      !pending,
                    )
                  }
                  InputProps={{
                    endAdornment: (
                      <Button
                        size="small"
                        disabled={
                          pending ||
                          (!(commentDrafts[draftKey] ?? "").trim() &&
                            (pendingCommentImages[draftKey]?.length ?? 0) === 0)
                        }
                        onClick={() => postMilestoneComment(item.proposalId, draftKey)}
                      >
                        Post
                      </Button>
                    ),
                  }}
                />
              </Stack>
            </>
          ) : null}
        </Box>
      );
    }

    return (
      <Box
        key={`c-${item.id}`}
        data-testid="feed-chat-card"
        sx={{
          border: `2px solid ${GARDEN_TOKENS.ink}`,
          borderLeft: `6px solid ${CHAT_RAIL}`,
          bgcolor: GARDEN_TOKENS.surface,
          p: 2,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Chip size="small" label="Chat" sx={{ fontWeight: 700 }} />
              <Typography variant="subtitle2" fontWeight={700}>
                {item.authorName}
                {item.authorId === currentUserId ? " (you)" : ""}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {new Date(item.createdAt).toLocaleString()}
            </Typography>
            {item.body ? (
              <Typography sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{item.body}</Typography>
            ) : null}
            <FeedImageStrip
              imageIds={item.imageIds}
              onOpen={(ids, index) => setLightbox({ ids, index })}
            />
          </Box>
          {item.canDelete || isAdmin ? (
            <IconButton
              aria-label="Delete message"
              size="small"
              onClick={() => deleteChat(item.id)}
              disabled={pending}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          ) : null}
        </Stack>

        <FeedLikeRow
          targetType="chat"
          targetId={item.id}
          likeCount={item.likeCount}
          likedByMe={item.likedByMe}
        />

        {item.comments.length > 0 ? (
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {item.comments.map((comment) => (
              <CommentBlock
                key={comment.id}
                comment={comment}
                commentTargetType="chat_comment"
                pending={pending}
                onDelete={deleteChatComment}
                onOpenImage={(ids, index) => setLightbox({ ids, index })}
              />
            ))}
          </Stack>
        ) : null}

        <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ mt: 1.5 }}>
          <IconButton
            size="small"
            aria-label="Attach to reply"
            onClick={() => {
              commentFileTargetRef.current = `chat-${item.id}`;
              fileInputRef.current?.click();
            }}
            disabled={
              pending ||
              (pendingCommentImages[`chat-${item.id}`]?.length ?? 0) >= MAX_FEED_IMAGES
            }
          >
            <AttachFileIcon fontSize="small" />
          </IconButton>
          <TextField
            fullWidth
            size="small"
            multiline
            minRows={1}
            maxRows={3}
            placeholder="Reply…"
            value={commentDrafts[`chat-${item.id}`] ?? ""}
            onChange={(e) =>
              setCommentDrafts((prev) => ({ ...prev, [`chat-${item.id}`]: e.target.value }))
            }
            onKeyDown={(e) =>
              handleCommentEnterKey(e, () => postChatComment(item.id), !pending)
            }
            InputProps={{
              endAdornment: (
                <Button
                  size="small"
                  disabled={
                    pending ||
                    (!(commentDrafts[`chat-${item.id}`] ?? "").trim() &&
                      (pendingCommentImages[`chat-${item.id}`]?.length ?? 0) === 0)
                  }
                  onClick={() => postChatComment(item.id)}
                >
                  Reply
                </Button>
              ),
            }}
          />
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 18 }}>
      <Typography variant="h5" component="h1" gutterBottom sx={brutalPageTitleSx}>
        Feed
      </Typography>
      <Typography sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
        Proposal milestones and network chat in one timeline.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Stack spacing={2}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress aria-label="Loading feed" data-testid="feed-loading" />
          </Box>
        ) : items.length === 0 ? (
          <Typography color="text.secondary">No feed activity yet.</Typography>
        ) : (
          items.map(renderItem)
        )}
        {nextCursor ? (
          <Button disabled={loadingMore} onClick={() => void loadFeed(nextCursor, { append: true })}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </Stack>

      <Box
        component="footer"
        data-testid="feed-composer"
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: { xs: 64, sm: 56 },
          zIndex: (theme) => theme.zIndex.appBar + 2,
          bgcolor: GARDEN_TOKENS.surface,
          borderTop: `2px solid ${GARDEN_TOKENS.ink}`,
          p: 1.5,
          pb: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        {pendingImages.length > 0 ? (
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
            {pendingImages.map((img) => (
              <Box key={img.id} sx={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.preview}
                  alt="Pending upload"
                  style={{ height: 56, width: 56, objectFit: "cover", border: `2px solid ${GARDEN_TOKENS.ink}` }}
                />
                <IconButton
                  size="small"
                  aria-label="Remove image"
                  onClick={() => {
                    URL.revokeObjectURL(img.preview);
                    setPendingImages((prev) => prev.filter((p) => p.id !== img.id));
                  }}
                  sx={{ position: "absolute", top: -8, right: -8, bgcolor: "background.paper" }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
        ) : null}
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) {
                void uploadFiles(e.target.files, commentFileTargetRef.current ?? undefined);
                commentFileTargetRef.current = null;
              }
              e.target.value = "";
            }}
          />
          <IconButton
            aria-label="Attach images"
            onClick={() => {
              commentFileTargetRef.current = null;
              fileInputRef.current?.click();
            }}
            disabled={pending || sending || pendingImages.length >= MAX_FEED_IMAGES}
          >
            <AttachFileIcon />
          </IconButton>
          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={4}
            label="Message the network"
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => handleCommentEnterKey(e, sendChat, !pending && !sending)}
          />
          <Button
            type="button"
            variant="contained"
            data-testid="feed-send"
            disabled={pending || sending || (!chatDraft.trim() && pendingImages.length === 0)}
            onClick={sendChat}
          >
            Send
          </Button>
        </Stack>
      </Box>

      <Dialog
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogContent sx={{ position: "relative", p: 2 }}>
          <IconButton
            aria-label="Close image"
            onClick={() => setLightbox(null)}
            sx={{ position: "absolute", right: 8, top: 8, zIndex: 1 }}
          >
            <CloseIcon />
          </IconButton>
          {lightbox ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={feedImageUrl(lightbox.ids[lightbox.index]!)}
                alt="Feed image full size"
                style={{ width: "100%", height: "auto", maxHeight: "80vh", objectFit: "contain" }}
              />
              {lightbox.ids.length > 1 ? (
                <Stack direction="row" justifyContent="center" spacing={2} sx={{ mt: 1 }}>
                  <Button
                    disabled={lightbox.index === 0}
                    onClick={() =>
                      setLightbox((lb) => (lb ? { ...lb, index: lb.index - 1 } : lb))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={lightbox.index >= lightbox.ids.length - 1}
                    onClick={() =>
                      setLightbox((lb) => (lb ? { ...lb, index: lb.index + 1 } : lb))
                    }
                  >
                    Next
                  </Button>
                </Stack>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {selectedProposalId ? (
        <ProposalDetailDialog
          proposalId={selectedProposalId}
          open={detailOpen}
          people={people}
          onEdit={() => {
            /* Edit opens from Proposals tab; Feed is read/comment focused. */
          }}
          onClose={() => {
            setDetailOpen(false);
            setSelectedProposalId(null);
            void loadFeed(null, { silent: true });
          }}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      ) : null}
    </Box>
  );
}
