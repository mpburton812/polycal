/** Shared main-tab hrefs for bottom nav and swipe navigation (PC-203 / PC-225). */
export const MAIN_TAB_HREFS = [
  "/feed",
  "/schedule",
  "/proposals",
  "/people-places",
  "/admin",
] as const;

export type MainTabHref = (typeof MAIN_TAB_HREFS)[number];
