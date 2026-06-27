/** Built-in avatar keys mapped to public static assets (Phase 1). */
export const AVATAR_OPTIONS = [
  { key: "bird_blue", label: "Blue bird", src: "/avatars/bird_blue.png" },
  { key: "bird_green", label: "Green bird", src: "/avatars/bird_green.png" },
  { key: "bird_orange", label: "Orange bird", src: "/avatars/bird_orange.png" },
  { key: "bird_purple", label: "Purple bird", src: "/avatars/bird_purple.png" },
  { key: "bird_red", label: "Red bird", src: "/avatars/bird_red.png" },
  { key: "bird_yellow", label: "Yellow bird", src: "/avatars/bird_yellow.png" },
] as const;

export type AvatarKey = (typeof AVATAR_OPTIONS)[number]["key"];

/** Resolves built-in bird avatars or custom uploads stored in `stored_images` (PC-45). */
export function avatarSrcForKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  const builtIn = AVATAR_OPTIONS.find((option) => option.key === key)?.src;
  if (builtIn) return builtIn;
  if (key.startsWith("custom:")) {
    const imageId = key.slice("custom:".length);
    if (imageId) return `/api/avatars/${encodeURIComponent(imageId)}`;
  }
  return undefined;
}

/** True when the avatar key references a user-uploaded image (PC-45). */
export function isCustomAvatarKey(key: string | null | undefined): boolean {
  return Boolean(key?.startsWith("custom:"));
}
