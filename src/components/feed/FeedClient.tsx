"use client";

import dynamic from "next/dynamic";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  deleteNetworkChatMessageAction,
  listFeedMilestonesAction,
  listNetworkChatMessagesAction,
  postNetworkChatMessageAction,
} from "@/actions/feed";
import type { FeedMilestone, NetworkChatMessage } from "@/lib/feed/types";
import { addProposalCommentAction } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
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

/**
 * Feed tab: proposal milestones with comments plus network chat (PC-225–PC-228).
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
  const [section, setSection] = useState(0);
  const [milestones, setMilestones] = useState<FeedMilestone[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<NetworkChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMilestones, setLoadingMilestones] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingChat, setLoadingChat] = useState(true);
  const [chatDraft, setChatDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const loadMilestones = useCallback(async (cursor?: string | null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoadingMilestones(true);
    const result = await listFeedMilestonesAction({ cursor: cursor ?? null, limit: 20 });
    if (!result.ok || !result.items) {
      setError(result.message);
    } else {
      setMilestones((prev) => (append ? [...prev, ...result.items!] : result.items!));
      setNextCursor(result.nextCursor ?? null);
    }
    setLoadingMilestones(false);
    setLoadingMore(false);
  }, []);

  const loadChat = useCallback(async () => {
    const result = await listNetworkChatMessagesAction({ limit: 50 });
    if (!result.ok || !result.items) {
      setError(result.message);
    } else {
      setChatMessages(result.items);
    }
    setLoadingChat(false);
  }, []);

  useEffect(() => {
    void loadMilestones();
    void loadChat();
  }, [loadMilestones, loadChat]);

  useEffect(() => {
    if (section !== 1) return;
    const timer = window.setInterval(() => {
      void loadChat();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [section, loadChat]);

  function openDetail(proposalId: string) {
    setSelectedProposalId(proposalId);
    setDetailOpen(true);
  }

  function postComment(proposalId: string) {
    const body = (commentDrafts[proposalId] ?? "").trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      const result = await addProposalCommentAction({ proposalId, body });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCommentDrafts((prev) => ({ ...prev, [proposalId]: "" }));
      await loadMilestones();
    });
  }

  function sendChat() {
    const body = chatDraft.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      const result = await postNetworkChatMessageAction({ body });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setChatDraft("");
      if (result.item) {
        setChatMessages((prev) => [result.item!, ...prev]);
      } else {
        await loadChat();
      }
    });
  }

  function deleteChat(messageId: string) {
    startTransition(async () => {
      const result = await deleteNetworkChatMessageAction(messageId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setChatMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    });
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Typography variant="h5" component="h1" gutterBottom sx={brutalPageTitleSx}>
        Feed
      </Typography>
      <Typography sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
        Proposal milestones and network chat.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Tabs
        value={section}
        onChange={(_, value: number) => setSection(value)}
        sx={{ mb: 2, borderBottom: `2px solid ${GARDEN_TOKENS.ink}` }}
      >
        <Tab label="Milestones" />
        <Tab label="Chat" />
      </Tabs>

      {section === 0 ? (
        <Stack spacing={2}>
          {loadingMilestones ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress aria-label="Loading milestones" />
            </Box>
          ) : milestones.length === 0 ? (
            <Typography color="text.secondary">No milestones yet.</Typography>
          ) : (
            milestones.map((item) => (
              <Box
                key={item.id}
                sx={{
                  border: `2px solid ${GARDEN_TOKENS.ink}`,
                  bgcolor: GARDEN_TOKENS.surface,
                  p: 2,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    label={item.proposalType === "sleeping" ? "Sleeping" : "Event"}
                  />
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

                {!item.masked && item.recentComments.length > 0 ? (
                  <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                    {item.recentComments.map((comment) => (
                      <Typography key={comment.id} variant="body2">
                        <strong>{comment.authorName}</strong>: {comment.body}
                      </Typography>
                    ))}
                  </Stack>
                ) : null}

                {item.canComment ? (
                  <TextField
                    fullWidth
                    size="small"
                    multiline
                    minRows={1}
                    maxRows={4}
                    placeholder="Write a comment…"
                    value={commentDrafts[item.proposalId] ?? ""}
                    onChange={(e) =>
                      setCommentDrafts((prev) => ({
                        ...prev,
                        [item.proposalId]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) =>
                      handleCommentEnterKey(e, () => postComment(item.proposalId), !pending)
                    }
                    sx={{ mt: 1.5 }}
                    InputProps={{
                      endAdornment: (
                        <Button
                          size="small"
                          disabled={pending || !(commentDrafts[item.proposalId] ?? "").trim()}
                          onClick={() => postComment(item.proposalId)}
                        >
                          Post
                        </Button>
                      ),
                    }}
                  />
                ) : null}
              </Box>
            ))
          )}
          {nextCursor ? (
            <Button
              disabled={loadingMore}
              onClick={() => void loadMilestones(nextCursor, true)}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </Stack>
      ) : (
        <Stack spacing={2}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            label="Message the network"
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => handleCommentEnterKey(e, sendChat, !pending)}
          />
          <Button
            variant="contained"
            disabled={pending || !chatDraft.trim()}
            onClick={sendChat}
          >
            Send
          </Button>

          {loadingChat ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress aria-label="Loading chat" />
            </Box>
          ) : chatMessages.length === 0 ? (
            <Typography color="text.secondary">No chat messages yet.</Typography>
          ) : (
            chatMessages.map((msg) => (
              <Box
                key={msg.id}
                sx={{
                  border: `2px solid ${GARDEN_TOKENS.ink}`,
                  p: 1.5,
                  bgcolor: GARDEN_TOKENS.surface,
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {msg.authorName}
                      {msg.authorId === currentUserId ? " (you)" : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(msg.createdAt).toLocaleString()}
                    </Typography>
                    <Typography sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{msg.body}</Typography>
                  </Box>
                  {msg.canDelete || isAdmin ? (
                    <IconButton
                      aria-label="Delete message"
                      size="small"
                      onClick={() => deleteChat(msg.id)}
                      disabled={pending}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </Stack>
              </Box>
            ))
          )}
        </Stack>
      )}

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
            void loadMilestones();
          }}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      ) : null}
    </Box>
  );
}
