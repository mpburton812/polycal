import { describe, expect, it } from "vitest";

import {
  AVATAR_CROP_MAX_ZOOM,
  AVATAR_CROP_MIN_ZOOM,
  AVATAR_OUTPUT_SIZE,
  MIN_CROPPED_AVATAR_BYTES,
  isCroppedAvatarLargeEnough,
  resolveAvatarMimeType,
} from "./crop";

describe("avatar crop helpers", () => {
  it("exports expected output size and zoom bounds", () => {
    expect(AVATAR_OUTPUT_SIZE).toBe(256);
    expect(AVATAR_CROP_MIN_ZOOM).toBeLessThan(1);
    expect(AVATAR_CROP_MAX_ZOOM).toBeGreaterThan(1);
  });

  it("resolves PNG only for PNG sources; otherwise JPEG", () => {
    expect(resolveAvatarMimeType("image/png")).toBe("image/png");
    expect(resolveAvatarMimeType("image/jpeg")).toBe("image/jpeg");
    expect(resolveAvatarMimeType("image/webp")).toBe("image/jpeg");
    expect(resolveAvatarMimeType("image/gif")).toBe("image/jpeg");
  });

  it("rejects cropped blobs below minimum byte threshold", () => {
    expect(isCroppedAvatarLargeEnough(MIN_CROPPED_AVATAR_BYTES - 1)).toBe(false);
    expect(isCroppedAvatarLargeEnough(MIN_CROPPED_AVATAR_BYTES)).toBe(true);
    expect(isCroppedAvatarLargeEnough(10_000)).toBe(true);
  });
});
