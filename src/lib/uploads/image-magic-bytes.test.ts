import { describe, expect, it } from "vitest";

import {
  fileMatchesImageMagicBytes,
  isSupportedImageMimeType,
  matchesImageMagicBytes,
} from "./image-magic-bytes";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const HTML = new Uint8Array(Buffer.from("<html><script>x</script>"));

describe("matchesImageMagicBytes", () => {
  it("accepts headers that match the declared MIME", () => {
    expect(matchesImageMagicBytes(JPEG, "image/jpeg")).toBe(true);
    expect(matchesImageMagicBytes(PNG, "image/png")).toBe(true);
    expect(matchesImageMagicBytes(GIF, "image/gif")).toBe(true);
    expect(matchesImageMagicBytes(WEBP, "image/webp")).toBe(true);
  });

  it("rejects a mismatch between the declared MIME and the bytes", () => {
    expect(matchesImageMagicBytes(HTML, "image/png")).toBe(false);
    expect(matchesImageMagicBytes(JPEG, "image/png")).toBe(false);
    expect(matchesImageMagicBytes(PNG, "image/jpeg")).toBe(false);
  });

  it("fails closed for unsupported MIME types", () => {
    expect(matchesImageMagicBytes(JPEG, "image/svg+xml")).toBe(false);
    expect(matchesImageMagicBytes(JPEG, "text/html")).toBe(false);
    expect(isSupportedImageMimeType("image/svg+xml")).toBe(false);
    expect(isSupportedImageMimeType("image/png")).toBe(true);
  });

  it("rejects truncated headers", () => {
    expect(matchesImageMagicBytes(new Uint8Array([0xff, 0xd8]), "image/jpeg")).toBe(false);
    expect(matchesImageMagicBytes(WEBP.slice(0, 8), "image/webp")).toBe(false);
  });
});

describe("fileMatchesImageMagicBytes", () => {
  it("reads only the header of the uploaded blob", async () => {
    const png = new Blob([PNG, new Uint8Array(1024)], { type: "image/png" });
    await expect(fileMatchesImageMagicBytes(png, "image/png")).resolves.toBe(true);

    const disguised = new Blob([HTML], { type: "image/png" });
    await expect(fileMatchesImageMagicBytes(disguised, "image/png")).resolves.toBe(false);
  });
});
