"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useRef, type PointerEvent, type ReactNode } from "react";

import { MAIN_TAB_HREFS } from "@/components/layout/mainTabs";

const SWIPE_MIN_PX = 72;
const SWIPE_MAX_VERTICAL_RATIO = 0.65;

function isInteractiveOrHorizontalScroll(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const el = target.closest(
    "input, textarea, select, button, a, [role='button'], [role='slider'], [contenteditable='true'], .MuiDrawer-root, .MuiModal-root, .MuiDialog-root",
  );
  if (el) return true;

  let node: Element | null = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowX = style.overflowX;
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth + 4
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Horizontal swipe on main content navigates adjacent bottom tabs (PC-203).
 * Ignores gestures that start on interactive controls or horizontally scrollable regions.
 */
export function TabSwipeRegion({
  children,
  isAdmin,
  feedEnabled = true,
}: {
  children: ReactNode;
  isAdmin: boolean;
  feedEnabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const startRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);

  const visibleHrefs = MAIN_TAB_HREFS.filter((href) => {
    if (!isAdmin && href === "/admin") return false;
    if (!feedEnabled && href === "/feed") return false;
    return true;
  });

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.buttons !== 1) return;
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      ignore: isInteractiveOrHorizontalScroll(event.target),
    };
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || start.ignore) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX) return;
      if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return;

      const index = visibleHrefs.findIndex(
        (href) => pathname === href || pathname.startsWith(`${href}/`),
      );
      if (index < 0) return;

      // Swipe left → next tab; swipe right → previous (mobile carousel convention).
      const nextIndex = dx < 0 ? index + 1 : index - 1;
      if (nextIndex < 0 || nextIndex >= visibleHrefs.length) return;
      router.push(visibleHrefs[nextIndex]);
    },
    [pathname, router, visibleHrefs],
  );

  const onPointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ minHeight: "inherit" }}
    >
      {children}
    </div>
  );
}
