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

export function avatarSrcForKey(key: string | null | undefined): string | undefined {
  return AVATAR_OPTIONS.find((option) => option.key === key)?.src;
}
