/** Output dimensions for stored custom avatars (PC-45 / PC-112). */
export const AVATAR_OUTPUT_SIZE = 256;

/** Zoom slider bounds — below 1 letterboxes; above 1 crops tighter (PC-112). */
export const AVATAR_CROP_MIN_ZOOM = 0.5;
export const AVATAR_CROP_MAX_ZOOM = 3;

/** Reject empty or near-empty crops from failed decode / zero draw (PC-112). */
export const MIN_CROPPED_AVATAR_BYTES = 512;

/** Pixel crop region from react-easy-crop `onCropComplete`. */
export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Picks output MIME — PNG preserves alpha; other uploads normalize to JPEG (PC-112).
 */
export function resolveAvatarMimeType(sourceType: string): "image/png" | "image/jpeg" {
  return sourceType === "image/png" ? "image/png" : "image/jpeg";
}

/**
 * Returns true when a cropped blob is large enough to be a real avatar image.
 */
export function isCroppedAvatarLargeEnough(byteSize: number): boolean {
  return byteSize >= MIN_CROPPED_AVATAR_BYTES;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mime,
      mime === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

/**
 * Renders a circular avatar file from a react-easy-crop pixel region (PC-112).
 */
export async function getCroppedAvatarFile(
  imageSrc: string,
  pixelCrop: CropAreaPixels,
  sourceMimeType: string,
): Promise<File | null> {
  if (pixelCrop.width <= 0 || pixelCrop.height <= 0) {
    return null;
  }

  const image = await loadImage(imageSrc);
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const mime = resolveAvatarMimeType(sourceMimeType);

  // Neutral fill so JPEG export never turns transparent pixels black.
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);

  ctx.beginPath();
  ctx.arc(AVATAR_OUTPUT_SIZE / 2, AVATAR_OUTPUT_SIZE / 2, AVATAR_OUTPUT_SIZE / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  const blob = await canvasToBlob(canvas, mime);
  if (!blob || !isCroppedAvatarLargeEnough(blob.size)) {
    return null;
  }

  const ext = mime === "image/png" ? "png" : "jpg";
  return new File([blob], `avatar.${ext}`, { type: mime });
}
