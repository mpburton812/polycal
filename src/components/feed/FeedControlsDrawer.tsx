"use client";

import SettingsIcon from "@mui/icons-material/Settings";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Drawer,
  FormControlLabel,
  FormGroup,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState, useTransition } from "react";

import { getFeedPrefsAction, updateFeedPrefsAction } from "@/actions/feed";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import {
  DEFAULT_FEED_PREFS,
  FEED_CONTENT_KINDS,
  FEED_INVOLVEMENTS,
  FEED_PRESET_LABELS,
  detectPresetId,
  prefsForPreset,
  type FeedContentKind,
  type FeedInvolvement,
  type FeedPrefs,
  type FeedPresetId,
} from "@/types/feed-prefs";
import { brutalSectionTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

const INVOLVEMENT_LABELS: Record<FeedInvolvement, string> = {
  myself: "Myself",
  partners: "My Partners",
  network: "My Network",
};

const CONTENT_LABELS: Record<FeedContentKind, string> = {
  proposed: "Proposed",
  votes: "Votes",
  resolved: "Resolved",
  messages: "Messages",
};

const PRESET_ORDER = Object.keys(FEED_PRESET_LABELS) as Array<Exclude<FeedPresetId, "custom">>;

/**
 * Feed Controls drawer — presets first; Detailed Tweaking collapsed by default (PC-268).
 */
export function FeedControlsDrawer({
  open,
  onClose,
  onPrefsApplied,
}: {
  open: boolean;
  onClose: () => void;
  onPrefsApplied: () => void;
}) {
  const [prefs, setPrefs] = useState<FeedPrefs>(DEFAULT_FEED_PREFS);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const next = await getFeedPrefsAction();
      if (!cancelled) {
        setPrefs(next);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function applyPreset(presetId: Exclude<FeedPresetId, "custom">) {
    setPrefs(prefsForPreset(presetId));
  }

  function setInvolvement(key: FeedInvolvement, value: boolean) {
    setPrefs((prev) => {
      const involvement = { ...prev.involvement, [key]: value };
      const next = { ...prev, involvement };
      return { ...next, presetId: detectPresetId(next) };
    });
  }

  function setContent(key: FeedContentKind, value: boolean) {
    setPrefs((prev) => {
      const content = { ...prev.content, [key]: value };
      const next = { ...prev, content };
      return { ...next, presetId: detectPresetId(next) };
    });
  }

  function setAllInvolvement(value: boolean) {
    setPrefs((prev) => {
      const involvement = Object.fromEntries(
        FEED_INVOLVEMENTS.map((k) => [k, value]),
      ) as FeedPrefs["involvement"];
      const next = { ...prev, involvement };
      return { ...next, presetId: detectPresetId(next) };
    });
  }

  function setAllContent(value: boolean) {
    setPrefs((prev) => {
      const content = Object.fromEntries(
        FEED_CONTENT_KINDS.map((k) => [k, value]),
      ) as FeedPrefs["content"];
      const next = { ...prev, content };
      return { ...next, presetId: detectPresetId(next) };
    });
  }

  function saveAndClose() {
    startTransition(async () => {
      const result = await updateFeedPrefsAction(prefs);
      if (result.ok && result.prefs) {
        setPrefs(result.prefs);
        onPrefsApplied();
        onClose();
      }
    });
  }

  function resetEverything() {
    setPrefs(prefsForPreset("everything"));
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 380 }, p: 2 } }}
    >
      <Stack spacing={2} data-testid="feed-controls-drawer">
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" component="h2" sx={brutalSectionTitleSx}>
            Feed controls
          </Typography>
          <Button onClick={onClose} size="small">
            Close
          </Button>
        </Stack>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, color: GARDEN_TOKENS.inkMuted }}>
            Presets
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {PRESET_ORDER.map((id) => (
              <Chip
                key={id}
                label={FEED_PRESET_LABELS[id]}
                color={prefs.presetId === id ? "primary" : "default"}
                variant={prefs.presetId === id ? "filled" : "outlined"}
                onClick={() => applyPreset(id)}
                disabled={!loaded || pending}
                data-testid={`feed-preset-${id}`}
              />
            ))}
          </Stack>
          {prefs.presetId === "custom" ? (
            <Typography variant="caption" sx={{ mt: 1, display: "block", color: GARDEN_TOKENS.inkMuted }}>
              Custom filters active
            </Typography>
          ) : null}
        </Box>

        <AdminCollapsibleSection title="Detailed Tweaking">
          <Stack spacing={2}>
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="subtitle2">Who</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setAllInvolvement(true)}>
                    All
                  </Button>
                  <Button size="small" onClick={() => setAllInvolvement(false)}>
                    None
                  </Button>
                </Stack>
              </Stack>
              <FormGroup>
                {FEED_INVOLVEMENTS.map((key) => (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        checked={prefs.involvement[key]}
                        onChange={(_, checked) => setInvolvement(key, checked)}
                        data-testid={`feed-involvement-${key}`}
                      />
                    }
                    label={INVOLVEMENT_LABELS[key]}
                  />
                ))}
              </FormGroup>
            </Box>

            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="subtitle2">What</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setAllContent(true)}>
                    All
                  </Button>
                  <Button size="small" onClick={() => setAllContent(false)}>
                    None
                  </Button>
                </Stack>
              </Stack>
              <FormGroup>
                {FEED_CONTENT_KINDS.map((key) => (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        checked={prefs.content[key]}
                        onChange={(_, checked) => setContent(key, checked)}
                        data-testid={`feed-content-${key}`}
                      />
                    }
                    label={CONTENT_LABELS[key]}
                  />
                ))}
              </FormGroup>
              {prefs.content.messages ? (
                <FormGroup sx={{ pl: 2 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={prefs.messagesInclude.networkChat}
                        onChange={(_, checked) =>
                          setPrefs((prev) => {
                            const next = {
                              ...prev,
                              messagesInclude: {
                                ...prev.messagesInclude,
                                networkChat: checked,
                              },
                            };
                            return { ...next, presetId: detectPresetId(next) };
                          })
                        }
                        data-testid="feed-messages-network-chat"
                      />
                    }
                    label="Network chat"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={prefs.messagesInclude.proposalComments}
                        onChange={(_, checked) =>
                          setPrefs((prev) => {
                            const next = {
                              ...prev,
                              messagesInclude: {
                                ...prev.messagesInclude,
                                proposalComments: checked,
                              },
                            };
                            return { ...next, presetId: detectPresetId(next) };
                          })
                        }
                        data-testid="feed-messages-proposal-comments"
                      />
                    }
                    label="Proposal comments"
                  />
                </FormGroup>
              ) : null}
            </Box>
          </Stack>
        </AdminCollapsibleSection>

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={resetEverything} disabled={pending}>
            Reset to everything
          </Button>
          <Button variant="contained" onClick={saveAndClose} disabled={pending || !loaded}>
            Done
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}

/** Settings cog that opens Feed Controls (PC-268). */
export function FeedControlsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <IconButton aria-label="Feed controls" onClick={onOpen} data-testid="feed-controls-open">
      <SettingsIcon />
    </IconButton>
  );
}
