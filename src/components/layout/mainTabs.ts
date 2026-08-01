/** Shared main-tab hrefs for bottom nav and swipe navigation (PC-203 / PC-225 / PC-393). */
export const MAIN_TAB_HREFS = [
  "/feed",
  "/schedule",
  "/proposals",
  "/people-places",
] as const;

export type MainTabHref = (typeof MAIN_TAB_HREFS)[number];
