import type { MetadataRoute } from "next";

import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Web app manifest for installable PWA distribution (PC-354).
 *
 * `id` is pinned so browsers keep treating reinstalls as the same app even if `start_url`
 * ever changes, and `scope` keeps external OAuth redirects (Google consent) out of the
 * standalone window.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PolyCal Group Scheduling",
    short_name: "PolyCal",
    description:
      "Private-group scheduling for polyamorous households: proposals, sleeping arrangements, shared feed, and optional calendar sync.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: GARDEN_TOKENS.background,
    theme_color: GARDEN_TOKENS.sage,
    orientation: "portrait-primary",
    categories: ["productivity", "lifestyle", "social"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Padded into the 80% safe zone so platform masks never clip the badge.
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
