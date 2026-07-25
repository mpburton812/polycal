/**
 * Shared image content sniffing for every upload surface (PC-59 / PC-353).
 *
 * A declared MIME type is attacker-controlled — it comes from the browser or,
 * for base64 payloads, straight from the request body. Uploads are stored and
 * later served back with that declared type, so an HTML or SVG payload labelled
 * `image/png` becomes stored XSS. Checking the leading bytes ties the stored
 * content type to what the file actually is.
 */

/** MIME types accepted anywhere images are uploaded. */
export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/** Bytes needed to identify every supported format (WebP needs the RIFF tag at offset 8). */
export const IMAGE_MAGIC_BYTE_LENGTH = 12;

/** True when the declared MIME is one this app knows how to validate and serve. */
export function isSupportedImageMimeType(value: string): value is SupportedImageMimeType {
  return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Checks a file header against the signature for the declared MIME type.
 * Unknown MIME types return false so callers fail closed.
 */
export function matchesImageMagicBytes(
  header: Uint8Array,
  mimeType: string,
): boolean {
  if (mimeType === "image/jpeg") {
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    );
  }
  if (mimeType === "image/gif") {
    return header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
  }
  if (mimeType === "image/webp") {
    return (
      header[0] === 0x52 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x46 &&
      header[8] === 0x57 &&
      header[9] === 0x45 &&
      header[10] === 0x42 &&
      header[11] === 0x50
    );
  }
  return false;
}

/** Reads just the header of an uploaded file and validates it against the MIME. */
export async function fileMatchesImageMagicBytes(
  file: Blob,
  mimeType: string,
): Promise<boolean> {
  const header = new Uint8Array(
    await file.slice(0, IMAGE_MAGIC_BYTE_LENGTH).arrayBuffer(),
  );
  return matchesImageMagicBytes(header, mimeType);
}

/** Human-readable rejection shared by all upload surfaces. */
export const IMAGE_CONTENT_MISMATCH_MESSAGE =
  "File content does not match a supported image format.";
