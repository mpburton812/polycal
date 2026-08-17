"use client";

import FeedbackIcon from "@mui/icons-material/Feedback";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { submitAlphaFeedbackAction } from "@/actions/alpha-feedback";
import { useToast } from "@/components/providers/ToastProvider";
import {
  getConsoleLogTail,
  installConsoleCapture,
} from "@/lib/alpha-feedback/console-capture";
import { parseOsLabel } from "@/lib/alpha-feedback/schema";
import { captureViewportScreenshot } from "@/lib/alpha-feedback/screenshot";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
import { GARDEN_TOKENS } from "@/theme/tokens";

type FeedbackKind = "bug" | "feature";

/**
 * Screenshot + submit dialog for alpha feedback (PC-419). Opened from the profile menu.
 */
export function useFeedbackDialog() {
  const pathname = usePathname();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotBase64, setScreenshotBase64] = useState<string | undefined>();
  const [screenshotMimeType, setScreenshotMimeType] = useState<
    "image/jpeg" | "image/png" | "image/webp" | undefined
  >();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    installConsoleCapture();
  }, []);

  useEffect(() => {
    if (!screenshotBase64 || !screenshotMimeType) {
      setPreviewUrl(null);
      return;
    }
    const url = `data:${screenshotMimeType};base64,${screenshotBase64}`;
    setPreviewUrl(url);
  }, [screenshotBase64, screenshotMimeType]);

  async function openDialog() {
    setCapturing(true);
    setKind("bug");
    setTitle("");
    setDescription("");
    try {
      const shot = await captureViewportScreenshot();
      setScreenshotBase64(shot?.base64);
      setScreenshotMimeType(shot?.mimeType);
    } finally {
      setCapturing(false);
      setOpen(true);
    }
  }

  function handleClose() {
    if (pending) return;
    setOpen(false);
  }

  function handleSubmit() {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
    startTransition(async () => {
      const result = await submitAlphaFeedbackAction({
        kind,
        title,
        description,
        pagePath: pathname || undefined,
        viewportWidth:
          typeof window !== "undefined" ? Math.round(window.innerWidth) : undefined,
        viewportHeight:
          typeof window !== "undefined" ? Math.round(window.innerHeight) : undefined,
        userAgent,
        osLabel: parseOsLabel(userAgent),
        consoleLogTail: getConsoleLogTail(),
        screenshotBase64,
        screenshotMimeType,
      });
      if (result.ok) {
        showToast(result.message, "success");
        setOpen(false);
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return {
    capturing,
    openDialog,
    dialog: (
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
      >
        <DialogTitle>Send feedback</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Report a bug or suggest a feature. A screenshot and diagnostics are attached
            automatically.
          </Typography>
          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">Type</FormLabel>
            <RadioGroup
              row
              value={kind}
              onChange={(event) => setKind(event.target.value as FeedbackKind)}
            >
              <FormControlLabel value="bug" control={<Radio />} label="Bug" />
              <FormControlLabel value="feature" control={<Radio />} label="Feature" />
            </RadioGroup>
          </FormControl>
          <TextField
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            fullWidth
            required
            margin="dense"
            inputProps={{ maxLength: LONG_TEXT_MAX }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            fullWidth
            required
            margin="dense"
            multiline
            minRows={4}
            inputProps={{ maxLength: LONG_TEXT_MAX }}
          />
          {previewUrl ? (
            <Box
              component="img"
              src={previewUrl}
              alt="Captured screenshot preview"
              sx={{
                mt: 2,
                width: "100%",
                maxHeight: 200,
                objectFit: "contain",
                border: `1px solid ${GARDEN_TOKENS.ink}22`,
                borderRadius: 1,
              }}
            />
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
              Screenshot unavailable — feedback can still be submitted.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={pending || !title.trim() || !description.trim()}
          >
            {pending ? "Submitting…" : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>
    ),
  };
}

export { FeedbackIcon };
