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
  deleteFeedMilestoneAction,
  deleteNetworkChatCommentAction,
  deleteNetworkChatMessageAction,
  getFeedUpdateTokenAction,
  listFeedItemsAction,
  postNetworkChatCommentAction,
  postNetworkChatMessageAction,
  previewFeedLinkAction,
  uploadFeedImageAction,
} from "@/actions/feed";
import {
  addProposalCommentAction,
  deleteProposalCommentAction,
} from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { FeedLikeRow } from "@/components/feed/FeedLikeControl";
import { useProposalCreate } from "@/components/proposals/ProposalCreateContext";
import {
  FeedControlsButton,
  FeedControlsDrawer,
} from "@/components/feed/FeedControlsDrawer";
import { FeedLinkifiedBody, FeedLinkPreviewCard } from "@/components/feed/FeedLinkPreview";
import { ADMIN_ONLY_FEED_COMMENT_BG } from "@/components/proposals/proposalCardTheme";
import { feedImageUrl, MAX_FEED_IMAGE_BYTES, MAX_FEED_IMAGES } from "@/lib/feed/images";
import type { FeedLikeTargetType } from "@/lib/feed/likes";
import type {
  FeedActiveEvent,
  FeedComment,
  FeedItem,
  FeedLinkPreview,
} from "@/lib/feed/types";
import { extractFirstUrl } from "@/lib/feed/link-preview-core";
import { getAppEnvironment } from "@/lib/env";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
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
const ACTIVE_EVENT_FILL = "#F5D76E";

type PendingImage = {
  /** Stable client key while upload is in flight. */
  localId: string;
  /** Server image id once upload succeeds; null while uploading or after failure. */
  id: string | null;
  preview: string;
  status: "uploading" | "ready" | "failed";
};

/**
 * Formats the active-event interval in the viewer's locale so the sticky pin
 * remains concise while still exposing both schedule boundaries (PC-298).
 */
function formatActiveEventSchedule(event: FeedActiveEvent): string {
  const start = new Date(event.scheduledStartAt).toLocaleString();
  if (!event.scheduledEndAt) return start;
  return `${start} – ${new Date(event.scheduledEndAt).toLocaleString()}`;
}

/**
 * Renders a feed image with one cache-bust retry on load failure (PC-247).
 * Prefers a local blob preview when available so optimistic posts stay visible.
 */
function FeedImage({
  imageId,
  alt,
  previewUrl,
  height,
  width,
  objectFit = "cover",
  maxHeight,
}: {
  imageId: string;
  alt: string;
  previewUrl?: string;
  height?: number | string;
  width?: number | string;
  objectFit?: "cover" | "contain";
  maxHeight?: number | string;
}) {
  const [src, setSrc] = useState(previewUrl ?? feedImageUrl(imageId));
  const [retried, setRetried] = useState(false);
  const usedPreview = useRef(Boolean(previewUrl));

  useEffect(() => {
    usedPreview.current = Boolean(previewUrl);
    setSrc(previewUrl ?? feedImageUrl(imageId));
    setRetried(false);
  }, [imageId, previewUrl]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{
        height: height ?? 96,
        width: width ?? 96,
        maxHeight,
        objectFit,
        display: "block",
      }}
      onError={() => {
        if (usedPreview.current) {
          // Blob preview failed or was revoked — fall through to the server URL once.
          usedPreview.current = false;
          setSrc(feedImageUrl(imageId));
          return;
        }
        if (retried) return;
        setRetried(true);
        setSrc(`${feedImageUrl(imageId)}?t=${Date.now()}`);
      }}
    />
  );
}

function FeedImageStrip({
  imageIds,
  onOpen,
  previewById,
}: {
  imageIds: string[];
  onOpen: (imageIds: string[], index: number) => void;
  previewById?: Record<string, string>;
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
          <FeedImage
            imageId={id}
            alt="Feed attachment"
            previewUrl={previewById?.[id]}
          />
        </Box>
      ))}
    </Stack>
  );
}

function PendingImageThumb({
  img,
  size,
  onRemove,
}: {
  img: PendingImage;
  size: number;
  onRemove: () => void;
}) {
  return (
    <Box sx={{ position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.preview}
        alt={img.status === "failed" ? "Upload failed" : "Pending upload"}
        style={{
          height: size,
          width: size,
          objectFit: "cover",
          border: `2px solid ${img.status === "failed" ? "#b00020" : GARDEN_TOKENS.ink}`,
          opacity: img.status === "uploading" ? 0.7 : 1,
          display: "block",
        }}
      />
      {img.status === "uploading" ? (
        <CircularProgress
          size={18}
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            mt: "-9px",
            ml: "-9px",
          }}
        />
      ) : null}
      {img.status === "failed" ? (
        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(176,0,32,0.75)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 10,
            textAlign: "center",
            px: 0.25,
          }}
        >
          Failed
        </Typography>
      ) : null}
      <IconButton
        size="small"
        aria-label="Remove image"
        onClick={onRemove}
        sx={{ position: "absolute", top: -8, right: -8, bgcolor: "background.paper" }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

function CommentBlock({
  comment,
  commentTargetType,
  onDelete,
  onOpenImage,
  pending,
  previewById,
  adminOnlyVisibility = false,
}: {
  comment: FeedComment;
  commentTargetType: Extract<FeedLikeTargetType, "chat_comment" | "proposal_comment">;
  onDelete: (id: string) => void;
  onOpenImage: (ids: string[], index: number) => void;
  pending: boolean;
  previewById?: Record<string, string>;
  /** Yellow highlight when the comment is only visible because the viewer is an admin (PC-250). */
  adminOnlyVisibility?: boolean;
}) {
  const isOptimistic = comment.id.startsWith("optimistic-");
  return (
    <Box
      sx={{
        pl: 1,
        pr: adminOnlyVisibility ? 1 : 0,
        py: adminOnlyVisibility ? 0.75 : 0,
        borderLeft: `2px solid ${GARDEN_TOKENS.inkMuted}`,
        bgcolor: adminOnlyVisibility ? ADMIN_ONLY_FEED_COMMENT_BG : "transparent",
        borderRadius: adminOnlyVisibility ? 1 : 0,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="body2"
            component="div"
            sx={{
              opacity: isOptimistic ? 0.85 : 1,
              minWidth: 0,
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            <strong>{comment.authorName}</strong>
            {comment.body ? ": " : ""}
            {comment.body ? (
              <FeedLinkifiedBody body={comment.body} inline sx={{ whiteSpace: "pre-wrap" }} />
            ) : null}
            {isOptimistic ? (
              <Typography component="span" variant="caption" sx={{ ml: 1, color: GARDEN_TOKENS.inkMuted }}>
                posting…
              </Typography>
            ) : null}
          </Typography>
          {comment.linkPreview?.status === "ok" ? (
            <FeedLinkPreviewCard preview={comment.linkPreview} />
          ) : null}
        </Box>
        {comment.canDelete && !isOptimistic ? (
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
      <FeedImageStrip
        imageIds={comment.imageIds}
        onOpen={onOpenImage}
        previewById={previewById}
      />
      {!isOptimistic ? (
        <FeedLikeRow
          targetType={commentTargetType}
          targetId={comment.id}
          likeCount={comment.likeCount}
          likedByMe={comment.likedByMe}
        />
      ) : null}
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
  const { openEdit } = useProposalCreate();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [activeEvents, setActiveEvents] = useState<FeedActiveEvent[]>([]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [composerLinkPreview, setComposerLinkPreview] = useState<FeedLinkPreview | null>(null);
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingCommentImages, setPendingCommentImages] = useState<
    Record<string, PendingImage[]>
  >({});
  /** Blob previews kept after post so optimistic comments show images immediately (PC-247). */
  const [blobPreviewById, setBlobPreviewById] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileTargetRef = useRef<string | null>(null);
  const sendInFlightRef = useRef(false);
  /** Last known first-page fingerprint — skip silent reload when unchanged. */
  const updateTokenRef = useRef<string | null>(null);

  const authorName =
    people.find((p) => p.id === currentUserId)?.displayName ?? "You";

  const loadFeed = useCallback(
    async (
      cursor?: string | null,
      options?: { append?: boolean; silent?: boolean },
    ) => {
      const append = options?.append ?? false;
      const silent = options?.silent ?? false;
      if (append) setLoadingMore(true);
      else if (!silent) setLoading(true);
      try {
        const result = await listFeedItemsAction({ cursor: cursor ?? null, limit: 20 });
        if (!result.ok || !result.items) {
          setError(result.message);
        } else {
          setItems((prev) => (append ? [...prev, ...result.items!] : result.items!));
          setNextCursor(result.nextCursor ?? null);
          if (!append) {
            const nextActiveEvents = result.activeEvents ?? [];
            setActiveEvents(nextActiveEvents);
            // Baseline silent polls against the server's cheap fingerprint (PC-336).
            updateTokenRef.current = result.updateToken ?? null;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load feed.");
      } finally {
        if (!silent || append) {
          setLoading(false);
          setLoadingMore(false);
        } else {
          setLoadingMore(false);
        }
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

  // Debounced Open Graph preview while composing (PC-279).
  useEffect(() => {
    const firstUrl = extractFirstUrl(chatDraft);
    if (!firstUrl) {
      setComposerLinkPreview(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void previewFeedLinkAction({ url: firstUrl }).then((result) => {
        if (cancelled) return;
        if (result.ok && result.preview?.status === "ok") {
          setComposerLinkPreview(result.preview);
        } else {
          setComposerLinkPreview(null);
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chatDraft]);

  function openDetail(proposalId: string) {
    setSelectedProposalId(proposalId);
    setDetailOpen(true);
  }

  function readyImageIds(images: PendingImage[]): string[] {
    return images.filter((p) => p.status === "ready" && p.id).map((p) => p.id!);
  }

  function hasUploadingImages(images: PendingImage[]): boolean {
    return images.some((p) => p.status === "uploading");
  }

  function hasFailedImages(images: PendingImage[]): boolean {
    return images.some((p) => p.status === "failed");
  }

  function rememberBlobPreviews(images: PendingImage[]) {
    const ready = images.filter((p) => p.status === "ready" && p.id);
    if (ready.length === 0) return;
    setBlobPreviewById((prev) => {
      const next = { ...prev };
      for (const img of ready) {
        next[img.id!] = img.preview;
      }
      return next;
    });
  }

  /**
   * Shows a local object-URL preview immediately, then uploads in the background (PC-247).
   */
  async function uploadFiles(files: FileList | File[], targetKey?: string) {
    const key = targetKey ?? "__composer__";
    const existing =
      key === "__composer__"
        ? pendingImages.length
        : (pendingCommentImages[key]?.length ?? 0);
    const list = Array.from(files).slice(0, MAX_FEED_IMAGES - existing);
    if (list.length === 0) return;

    const oversized = list.find((file) => file.size > MAX_FEED_IMAGE_BYTES);
    if (oversized) {
      setError(
        `Each image must be ${Math.round(MAX_FEED_IMAGE_BYTES / (1024 * 1024))}MB or smaller.`,
      );
      return;
    }

    const placeholders: PendingImage[] = list.map((file) => ({
      localId: crypto.randomUUID(),
      id: null,
      preview: URL.createObjectURL(file),
      status: "uploading" as const,
    }));

    if (key === "__composer__") {
      setPendingImages((prev) => [...prev, ...placeholders]);
    } else {
      setPendingCommentImages((prev) => ({
        ...prev,
        [key]: [...(prev[key] ?? []), ...placeholders],
      }));
    }

    setError(null);

    for (let i = 0; i < list.length; i += 1) {
      const file = list[i]!;
      const localId = placeholders[i]!.localId;
      const fd = new FormData();
      fd.append("image0", file);
      try {
        const result = await uploadFeedImageAction(fd);
        if (!result.ok || !result.imageId) {
          const message = result.message || "Image upload failed.";
          setError(message);
          const markFailed = (prev: PendingImage[]) =>
            prev.map((p) =>
              p.localId === localId ? { ...p, status: "failed" as const } : p,
            );
          if (key === "__composer__") {
            setPendingImages(markFailed);
          } else {
            setPendingCommentImages((prev) => ({
              ...prev,
              [key]: markFailed(prev[key] ?? []),
            }));
          }
          continue;
        }
        const markReady = (prev: PendingImage[]) =>
          prev.map((p) =>
            p.localId === localId
              ? { ...p, id: result.imageId!, status: "ready" as const }
              : p,
          );
        if (key === "__composer__") {
          setPendingImages(markReady);
        } else {
          setPendingCommentImages((prev) => ({
            ...prev,
            [key]: markReady(prev[key] ?? []),
          }));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Image upload failed. Try again.";
        setError(message);
        const markFailed = (prev: PendingImage[]) =>
          prev.map((p) =>
            p.localId === localId ? { ...p, status: "failed" as const } : p,
          );
        if (key === "__composer__") {
          setPendingImages(markFailed);
        } else {
          setPendingCommentImages((prev) => ({
            ...prev,
            [key]: markFailed(prev[key] ?? []),
          }));
        }
      }
    }
  }

  function removePendingImage(key: string, localId: string) {
    if (key === "__composer__") {
      setPendingImages((prev) => {
        const target = prev.find((p) => p.localId === localId);
        if (target && !target.id) URL.revokeObjectURL(target.preview);
        return prev.filter((p) => p.localId !== localId);
      });
      return;
    }
    setPendingCommentImages((prev) => {
      const list = prev[key] ?? [];
      const target = list.find((p) => p.localId === localId);
      if (target && !target.id) URL.revokeObjectURL(target.preview);
      const nextList = list.filter((p) => p.localId !== localId);
      const next = { ...prev };
      if (nextList.length === 0) delete next[key];
      else next[key] = nextList;
      return next;
    });
  }

  function clearCommentImages(key: string, options?: { revoke?: boolean }) {
    setPendingCommentImages((prev) => {
      const imgs = prev[key] ?? [];
      if (options?.revoke !== false) {
        imgs.forEach((p) => URL.revokeObjectURL(p.preview));
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function buildOptimisticComment(body: string, imageIds: string[]): FeedComment {
    return {
      id: `optimistic-${crypto.randomUUID()}`,
      authorId: currentUserId,
      authorName,
      body,
      createdAt: new Date().toISOString(),
      imageIds,
      canDelete: true,
      likeCount: 0,
      likedByMe: false,
      linkPreview: null,
    };
  }

  function postMilestoneComment(proposalId: string, draftKey: string) {
    const body = (commentDrafts[draftKey] ?? "").trim();
    const pendingImgs = pendingCommentImages[draftKey] ?? [];
    if (hasUploadingImages(pendingImgs)) {
      setError("Wait for images to finish uploading.");
      return;
    }
    if (hasFailedImages(pendingImgs)) {
      setError("Remove failed images or re-attach them before posting.");
      return;
    }
    const imageIds = readyImageIds(pendingImgs);
    if (!body && imageIds.length === 0) return;
    setError(null);

    const optimistic = buildOptimisticComment(body, imageIds);
    const imageSnapshot = pendingImgs;
    rememberBlobPreviews(pendingImgs);
    setItems((prev) =>
      prev.map((item) =>
        item.kind === "milestone" && item.proposalId === proposalId
          ? { ...item, comments: [...item.comments, optimistic] }
          : item,
      ),
    );
    setCommentDrafts((prev) => ({ ...prev, [draftKey]: "" }));
    clearCommentImages(draftKey, { revoke: false });

    startTransition(async () => {
      const result = await addProposalCommentAction({ proposalId, body, imageIds });
      if (!result.ok) {
        setError(result.message);
        setItems((prev) =>
          prev.map((item) =>
            item.kind === "milestone" && item.proposalId === proposalId
              ? {
                  ...item,
                  comments: item.comments.filter((c) => c.id !== optimistic.id),
                }
              : item,
          ),
        );
        setCommentDrafts((prev) => ({ ...prev, [draftKey]: body }));
        setPendingCommentImages((prev) => ({ ...prev, [draftKey]: imageSnapshot }));
        return;
      }
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
    if (hasUploadingImages(pendingImages)) {
      setError("Wait for images to finish uploading.");
      return;
    }
    if (hasFailedImages(pendingImages)) {
      setError("Remove failed images or re-attach them before sending.");
      return;
    }
    const imageIds = readyImageIds(pendingImages);
    if (!body && imageIds.length === 0) return;
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setError(null);
    setSending(true);
    rememberBlobPreviews(pendingImages);
    void (async () => {
      try {
        const result = await postNetworkChatMessageAction({
          body,
          imageIds,
        });
        if (!result.ok) {
          setError(result.message || "Failed to send message.");
          return;
        }
        setChatDraft("");
        setComposerLinkPreview(null);
        // Blob URLs kept in blobPreviewById for the optimistic/server item strip.
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
    const pendingImgs = pendingCommentImages[draftKey] ?? [];
    if (hasUploadingImages(pendingImgs)) {
      setError("Wait for images to finish uploading.");
      return;
    }
    if (hasFailedImages(pendingImgs)) {
      setError("Remove failed images or re-attach them before posting.");
      return;
    }
    const imageIds = readyImageIds(pendingImgs);
    if (!body && imageIds.length === 0) return;
    setError(null);

    const optimistic = buildOptimisticComment(body, imageIds);
    const imageSnapshot = pendingImgs;
    rememberBlobPreviews(pendingImgs);
    setItems((prev) =>
      prev.map((item) =>
        item.kind === "chat" && item.id === messageId
          ? { ...item, comments: [...item.comments, optimistic] }
          : item,
      ),
    );
    setCommentDrafts((prev) => ({ ...prev, [draftKey]: "" }));
    clearCommentImages(draftKey, { revoke: false });

    startTransition(async () => {
      const result = await postNetworkChatCommentAction({ messageId, body, imageIds });
      if (!result.ok) {
        setError(result.message);
        setItems((prev) =>
          prev.map((item) =>
            item.kind === "chat" && item.id === messageId
              ? {
                  ...item,
                  comments: item.comments.filter((c) => c.id !== optimistic.id),
                }
              : item,
          ),
        );
        setCommentDrafts((prev) => ({ ...prev, [draftKey]: body }));
        setPendingCommentImages((prev) => ({ ...prev, [draftKey]: imageSnapshot }));
        return;
      }
      if (result.comment) {
        setItems((prev) =>
          prev.map((item) =>
            item.kind === "chat" && item.id === messageId
              ? {
                  ...item,
                  comments: item.comments.map((c) =>
                    c.id === optimistic.id ? result.comment! : c,
                  ),
                }
              : item,
          ),
        );
        updateTokenRef.current = null;
      } else {
        await loadFeed(null, { silent: true });
      }
    });
  }

  function deleteChat(messageId: string) {
    startTransition(async () => {
      const result = await deleteNetworkChatMessageAction(messageId);
      if (!result.ok) setError(result.message);
      else await loadFeed(null, { silent: true });
    });
  }

  function deleteMilestone(milestoneId: string) {
    startTransition(async () => {
      const result = await deleteFeedMilestoneAction(milestoneId);
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
          data-testid="feed-milestone-card"
          sx={{
            border: `2px solid ${GARDEN_TOKENS.ink}`,
            borderLeft: `6px solid ${MILESTONE_RAIL}`,
            bgcolor: GARDEN_TOKENS.surface,
            p: 2,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
              <Chip size="small" label="Milestone" sx={{ fontWeight: 700 }} />
              <Chip
                size="small"
                label={
                  item.proposalType === "fast_sleep"
                    ? "FastSleep Proposal"
                    : item.proposalType === "sleeping"
                      ? "Sleeping"
                      : "Event"
                }
              />
              <Chip size="small" variant="outlined" label={item.proposalState} />
            </Stack>
            {item.canDelete || isAdmin ? (
              <IconButton
                aria-label="Delete milestone"
                size="small"
                onClick={() => deleteMilestone(item.id)}
                disabled={pending}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            ) : null}
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
                  previewById={blobPreviewById}
                  adminOnlyVisibility={item.visibleViaAdminOnly}
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
                    <PendingImageThumb
                      key={img.localId}
                      img={img}
                      size={48}
                      onRemove={() => removePendingImage(draftKey, img.localId)}
                    />
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
                  minRows={2}
                  maxRows={3}
                  placeholder="Comment on this milestone…"
                  value={commentDrafts[draftKey] ?? ""}
                  onChange={(e) =>
                    setCommentDrafts((prev) => ({ ...prev, [draftKey]: e.target.value }))
                  }
                  inputProps={{ maxLength: LONG_TEXT_MAX }}
                  InputProps={{
                    endAdornment: (
                      <Button
                        size="small"
                        disabled={
                          pending ||
                          hasUploadingImages(pendingCommentImages[draftKey] ?? []) ||
                          (!(commentDrafts[draftKey] ?? "").trim() &&
                            readyImageIds(pendingCommentImages[draftKey] ?? []).length === 0)
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
              <FeedLinkifiedBody
                body={item.body}
                sx={{
                  mt: 0.5,
                  whiteSpace: "pre-wrap",
                  minWidth: 0,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              />
            ) : null}
            {item.linkPreview?.status === "ok" ? (
              <FeedLinkPreviewCard preview={item.linkPreview} />
            ) : null}
            <FeedImageStrip
              imageIds={item.imageIds}
              onOpen={(ids, index) => setLightbox({ ids, index })}
              previewById={blobPreviewById}
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
                previewById={blobPreviewById}
                onDelete={deleteChatComment}
                onOpenImage={(ids, index) => setLightbox({ ids, index })}
              />
            ))}
          </Stack>
        ) : null}

        {(pendingCommentImages[`chat-${item.id}`] ?? []).length > 0 ? (
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
            {(pendingCommentImages[`chat-${item.id}`] ?? []).map((img) => (
              <PendingImageThumb
                key={img.localId}
                img={img}
                size={48}
                onRemove={() => removePendingImage(`chat-${item.id}`, img.localId)}
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
            minRows={2}
            maxRows={3}
            placeholder="Reply…"
            value={commentDrafts[`chat-${item.id}`] ?? ""}
            onChange={(e) =>
              setCommentDrafts((prev) => ({ ...prev, [`chat-${item.id}`]: e.target.value }))
            }
            inputProps={{ maxLength: LONG_TEXT_MAX }}
            InputProps={{
              endAdornment: (
                <Button
                  size="small"
                  disabled={
                    pending ||
                    hasUploadingImages(pendingCommentImages[`chat-${item.id}`] ?? []) ||
                    (!(commentDrafts[`chat-${item.id}`] ?? "").trim() &&
                      readyImageIds(pendingCommentImages[`chat-${item.id}`] ?? []).length === 0)
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
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="h5" component="h1" sx={brutalPageTitleSx}>
          Feed
        </Typography>
        <FeedControlsButton onOpen={() => setControlsOpen(true)} />
      </Stack>

      <FeedControlsDrawer
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        onPrefsApplied={() => void loadFeed(null, { silent: false })}
      />

      {activeEvents.length > 0 ? (
        <Box
          component="section"
          aria-label="Events happening now"
          data-testid="feed-active-events"
          sx={{
            position: "sticky",
            top:
              getAppEnvironment() === "production"
                ? { xs: 56, sm: 64 }
                : { xs: 88, sm: 72 },
            zIndex: 1100,
            bgcolor: GARDEN_TOKENS.background,
            border: `3px solid ${GARDEN_TOKENS.ink}`,
            p: 1,
            mb: 2,
            maxHeight: "42vh",
            overflowY: "auto",
          }}
        >
          <Chip
            size="small"
            label="Happening now"
            sx={{
              mb: 1,
              bgcolor: GARDEN_TOKENS.mustard,
              color: GARDEN_TOKENS.ink,
              border: `2px solid ${GARDEN_TOKENS.ink}`,
              fontWeight: 800,
            }}
          />
          <Stack spacing={1}>
            {activeEvents.map((event) => {
              const draftKey = `active-${event.proposalId}`;
              return (
              <Box
                key={event.proposalId}
                data-testid="feed-active-event"
                sx={{
                  bgcolor: ACTIVE_EVENT_FILL,
                  border: `3px solid ${GARDEN_TOKENS.ink}`,
                  p: 1.5,
                }}
              >
                <Typography variant="subtitle1" fontWeight={800}>
                  {event.title}
                </Typography>
                <Typography variant="body2" sx={{ color: GARDEN_TOKENS.ink, mt: 0.25 }}>
                  {formatActiveEventSchedule(event)}
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => openDetail(event.proposalId)}
                  sx={{
                    mt: 0.75,
                    bgcolor: GARDEN_TOKENS.ink,
                    color: GARDEN_TOKENS.surface,
                    "&:hover": { bgcolor: GARDEN_TOKENS.inkMuted },
                  }}
                >
                  Open proposal
                </Button>
                {event.canComment ? (
                  <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ mt: 1.25 }}>
                    <TextField
                      fullWidth
                      size="small"
                      multiline
                      minRows={1}
                      maxRows={3}
                      placeholder="Comment on this event…"
                      value={commentDrafts[draftKey] ?? ""}
                      onChange={(e) =>
                        setCommentDrafts((prev) => ({ ...prev, [draftKey]: e.target.value }))
                      }
                      inputProps={{ maxLength: LONG_TEXT_MAX }}
                      InputProps={{
                        endAdornment: (
                          <Button
                            size="small"
                            disabled={pending || !(commentDrafts[draftKey] ?? "").trim()}
                            onClick={() => postMilestoneComment(event.proposalId, draftKey)}
                          >
                            Post
                          </Button>
                        ),
                      }}
                    />
                  </Stack>
                ) : null}
              </Box>
              );
            })}
          </Stack>
        </Box>
      ) : null}

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
              <PendingImageThumb
                key={img.localId}
                img={img}
                size={56}
                onRemove={() => removePendingImage("__composer__", img.localId)}
              />
            ))}
          </Stack>
        ) : null}
        {composerLinkPreview ? (
          <Box sx={{ mb: 1, maxWidth: 480 }}>
            <FeedLinkPreviewCard preview={composerLinkPreview} />
          </Box>
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
            minRows={2}
            maxRows={4}
            label="Message the network"
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            inputProps={{ maxLength: LONG_TEXT_MAX }}
          />
          <Button
            type="button"
            variant="contained"
            data-testid="feed-send"
            disabled={
              pending ||
              sending ||
              hasUploadingImages(pendingImages) ||
              (!chatDraft.trim() && readyImageIds(pendingImages).length === 0)
            }
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
              <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
                <FeedImage
                  imageId={lightbox.ids[lightbox.index]!}
                  alt="Feed image full size"
                  previewUrl={blobPreviewById[lightbox.ids[lightbox.index]!]}
                  height="auto"
                  width="100%"
                  maxHeight="80vh"
                  objectFit="contain"
                />
              </Box>
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
          onEdit={(detail) => {
            setDetailOpen(false);
            setSelectedProposalId(null);
            openEdit(detail);
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
