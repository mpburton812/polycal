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
import { useCallback, useEffect, useRef, useState } from "react";

const OUTPUT_SIZE = 256;

interface AvatarCropDialogProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (croppedFile: File) => void;
}

/**
 * Circular avatar crop — pan and zoom before upload (PC-65).
 */
export function AvatarCropDialog({ open, file, onClose, onConfirm }: AvatarCropDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: offset.x,
        baseY: offset.y,
      };
    },
    [offset.x, offset.y],
  );

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.baseX + (event.clientX - dragRef.current.startX),
      y: dragRef.current.baseY + (event.clientY - dragRef.current.startY),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  function cropToFile(): File | null {
    const img = imageRef.current;
    if (!img || !file) return null;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const viewSize = 220;
    const scale = (viewSize / Math.min(img.naturalWidth, img.naturalHeight)) * zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const centerX = viewSize / 2 + offset.x;
    const centerY = viewSize / 2 + offset.y;
    const sx = centerX - drawW / 2;
    const sy = centerY - drawH / 2;

    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const ratio = OUTPUT_SIZE / viewSize;
    ctx.drawImage(img, sx * ratio, sy * ratio, drawW * ratio, drawH * ratio);

    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const dataUrl = canvas.toDataURL(mime, 0.92);
    const binary = atob(dataUrl.split(",")[1] ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const ext = mime === "image/png" ? "png" : "jpg";
    return new File([bytes], `avatar.${ext}`, { type: mime });
  }

  function handleConfirm() {
    const cropped = cropToFile();
    if (!cropped) return;
    onConfirm(cropped);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Adjust avatar</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Drag to reposition and use the slider to zoom. The circle is what others will see.
        </Typography>
        <Box
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          sx={{
            position: "relative",
            width: 220,
            height: 220,
            mx: "auto",
            borderRadius: "50%",
            overflow: "hidden",
            bgcolor: "grey.200",
            cursor: "grab",
            touchAction: "none",
            border: "2px solid",
            borderColor: "divider",
          }}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Avatar preview"
              draggable={false}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
                transformOrigin: "center center",
                maxWidth: "none",
                userSelect: "none",
                pointerEvents: "none",
              }}
              onLoad={(event) => {
                imageRef.current = event.currentTarget;
              }}
            />
          )}
        </Box>
        <Stack spacing={1} sx={{ mt: 2 }}>
          <Typography variant="caption">Zoom</Typography>
          <Slider
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(_, value) => setZoom(value as number)}
            aria-label="Avatar zoom"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!imageUrl}>
          Use photo
        </Button>
      </DialogActions>
    </Dialog>
  );
}
