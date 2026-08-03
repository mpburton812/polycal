"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  MAIN_TAB_HREFS,
  type MainTabHref,
} from "@/components/layout/mainTabs";

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

function matchMainTab(
  pathname: string,
  visible: readonly MainTabHref[],
): MainTabHref | null {
  for (const href of visible) {
    if (pathname === href || pathname.startsWith(`${href}/`)) return href;
  }
  return null;
}

/**
 * Keep-alive main-tab carousel (PC-407): panels stay mounted after first visit
 * so swipe/tap back preserves scroll and in-panel React state. Non-main routes
 * (profile/admin) render children normally without clearing the cache.
 */
export function MainTabCarousel({
  children,
  feedEnabled = true,
}: {
  children: ReactNode;
  isAdmin?: boolean;
  feedEnabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const visibleHrefs = useMemo(
    () =>
      MAIN_TAB_HREFS.filter((href) => {
        if (!feedEnabled && href === "/feed") return false;
        return true;
      }),
    [feedEnabled],
  );

  const activeHref = matchMainTab(pathname, visibleHrefs);
  const onMainTab = activeHref != null;

  const [cache, setCache] = useState<Partial<Record<MainTabHref, ReactNode>>>({});
  const [dragPx, setDragPx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const widthRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!activeHref) return;
    setCache((prev) => ({ ...prev, [activeHref]: children }));
  }, [activeHref, children]);

  const activeIndex = activeHref ? visibleHrefs.indexOf(activeHref) : 0;

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= visibleHrefs.length) return;
      const href = visibleHrefs[nextIndex];
      if (!href || href === activeHref) return;
      setAnimating(true);
      router.push(href);
      window.setTimeout(() => setAnimating(false), 280);
    },
    [activeHref, router, visibleHrefs],
  );

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.buttons !== 1) return;
    widthRef.current = viewportRef.current?.clientWidth ?? window.innerWidth;
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      ignore: isInteractiveOrHorizontalScroll(event.target),
    };
    setDragPx(0);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.ignore) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) {
      setDragPx(0);
      return;
    }
    setDragPx(dx);
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      startRef.current = null;
      const dx = dragPx || (start ? event.clientX - start.x : 0);
      setDragPx(0);
      if (!start || start.ignore || !onMainTab) return;

      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX) return;
      if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return;

      const nextIndex = dx < 0 ? activeIndex + 1 : activeIndex - 1;
      goToIndex(nextIndex);
    },
    [activeIndex, dragPx, goToIndex, onMainTab],
  );

  const onPointerCancel = useCallback(() => {
    startRef.current = null;
    setDragPx(0);
  }, []);

  if (!onMainTab) {
    return <>{children}</>;
  }

  const width = widthRef.current || 1;
  const dragPercent = dragPx === 0 ? 0 : (dragPx / width) * 100;
  const translate = -(activeIndex * 100) + dragPercent;

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        overflow: "hidden",
        width: "100%",
        minHeight: "inherit",
        touchAction: "pan-y",
      }}
      data-testid="main-tab-carousel"
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          transform: `translateX(${translate}%)`,
          transition:
            dragPx !== 0 || !animating
              ? dragPx !== 0
                ? "none"
                : "transform 220ms ease-out"
              : "transform 220ms ease-out",
          willChange: "transform",
        }}
      >
        {visibleHrefs.map((href) => {
          const isActive = href === activeHref;
          const panel = cache[href] ?? (isActive ? children : null);
          return (
            <div
              key={href}
              data-testid={`main-tab-panel-${href.slice(1)}`}
              data-active={isActive ? "true" : "false"}
              aria-hidden={!isActive}
              style={{
                minWidth: "100%",
                width: "100%",
                flexShrink: 0,
                visibility: panel ? "visible" : "hidden",
                pointerEvents: isActive ? "auto" : "none",
              }}
            >
              {panel}
            </div>
          );
        })}
      </div>
    </div>
  );
}
