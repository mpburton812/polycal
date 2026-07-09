"use client";

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

import {
  AVATAR_CROP_MAX_ZOOM,
  AVATAR_CROP_MIN_ZOOM,
  getCroppedAvatarFile,
} from "@/lib/avatars/crop";

const CROP_VIEW_HEIGHT = 280;

interface AvatarCropDialogProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (croppedFile: File) => void;
}

/**
 * Circular avatar crop with react-easy-crop — pan, zoom out/in, WYSIWYG export (PC-65 / PC-112).
 */
export function AvatarCropDialog({ open, file, onClose, onConfirm }: AvatarCropDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setImageLoaded(false);
    setCroppedAreaPixels(null);
    setExportError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!imageUrl || !file || !croppedAreaPixels || !imageLoaded) {
      return;
    }

    setExporting(true);
    setExportError(null);
    try {
      const cropped = await getCroppedAvatarFile(imageUrl, croppedAreaPixels, file.type);
      if (!cropped) {
        setExportError("Could not process this image. Wait for it to load or try another photo.");
        return;
      }
      onConfirm(cropped);
    } catch {
      setExportError("Could not process this image. Try another photo.");
    } finally {
      setExporting(false);
    }
  }

  const canConfirm = imageLoaded && croppedAreaPixels !== null && !exporting;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Adjust avatar</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Drag to reposition. Slide left to fit more of the photo, right to crop in. The circle is
          what others will see.
        </Typography>
        <Box
          sx={{
            position: "relative",
            width: "100%",
            height: CROP_VIEW_HEIGHT,
            bgcolor: "grey.900",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              objectFit="contain"
              minZoom={AVATAR_CROP_MIN_ZOOM}
              maxZoom={AVATAR_CROP_MAX_ZOOM}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              onMediaLoaded={() => setImageLoaded(true)}
            />
          )}
        </Box>
        <Stack spacing={0.5} sx={{ mt: 2 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption">Fit</Typography>
            <Typography variant="caption">Crop in</Typography>
          </Stack>
          <Slider
            min={AVATAR_CROP_MIN_ZOOM}
            max={AVATAR_CROP_MAX_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(_, value) => setZoom(value as number)}
            aria-label="Avatar zoom"
            disabled={!imageLoaded}
          />
        </Stack>
        {exportError && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {exportError}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleConfirm()} disabled={!canConfirm}>
          {exporting ? "Processing…" : imageLoaded ? "Use photo" : "Loading…"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
