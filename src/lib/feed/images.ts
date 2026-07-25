import {
  fileMatchesImageMagicBytes,
  IMAGE_CONTENT_MISMATCH_MESSAGE,
} from "@/lib/uploads/image-magic-bytes";

/** Max images per feed message or comment (PC-236). */
export const MAX_FEED_IMAGES = 4;

/** Max bytes per feed image upload (PC-236). */
export const MAX_FEED_IMAGE_BYTES = 4 * 1024 * 1024;

const ALLOWED_FEED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Builds the authenticated URL for a feed-attached image blob (PC-236).
 */
export function feedImageUrl(imageId: string): string {
  return `/api/feed-images/${encodeURIComponent(imageId)}`;
}

function guessImageMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/**
 * Validates a single image file from FormData for feed attach (PC-236).
 */
export async function readFeedImageUpload(
  entry: FormDataEntryValue | null,
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  if (!entry) {
    return { ok: false, error: "Choose an image file." };
  }

  let file: File;
  if (entry instanceof File) {
    file = entry;
  } else if (typeof entry === "object" && "arrayBuffer" in entry) {
    const blob = entry as Blob;
    file = new File([blob], "feed-image", { type: blob.type || "application/octet-stream" });
  } else {
    return { ok: false, error: "Choose an image file." };
  }

  if (file.size === 0) {
    return { ok: false, error: "Choose an image file." };
  }
  if (file.size > MAX_FEED_IMAGE_BYTES) {
    return { ok: false, error: "Image must be 4 MB or smaller." };
  }

  const mimeType = file.type || guessImageMime(file.name);
  if (!ALLOWED_FEED_IMAGE_MIMES.has(mimeType)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, or GIF." };
  }

  // Feed images are served back with their stored MIME, so the declared type
  // must match the actual bytes (PC-353).
  if (!(await fileMatchesImageMagicBytes(file, mimeType))) {
    return { ok: false, error: IMAGE_CONTENT_MISMATCH_MESSAGE };
  }

  return {
    ok: true,
    file: mimeType === file.type ? file : new File([file], file.name, { type: mimeType }),
  };
}

/**
 * Reads up to {@link MAX_FEED_IMAGES} validated files from FormData keys `image0`…`image3`.
 */
export async function readFeedImageUploads(
  formData: FormData,
): Promise<{ ok: true; files: File[] } | { ok: false; error: string }> {
  const files: File[] = [];
  for (let i = 0; i < MAX_FEED_IMAGES; i += 1) {
    const entry = formData.get(`image${i}`);
    if (!entry) continue;
    const parsed = await readFeedImageUpload(entry);
    if (!parsed.ok) return parsed;
    files.push(parsed.file);
  }
  if (files.length > MAX_FEED_IMAGES) {
    return { ok: false, error: `At most ${MAX_FEED_IMAGES} images allowed.` };
  }
  return { ok: true, files };
}
