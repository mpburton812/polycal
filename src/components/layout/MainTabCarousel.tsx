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
 * One keep-alive slot per main tab (PC-407). Captures the first live RSC tree and
 * keeps that fiber mounted under display:none so client sub-tab state survives.
 */
function KeepAlivePanel({
  href,
  active,
  children,
  slideDir,
}: {
  href: MainTabHref;
  active: boolean;
  children: ReactNode | null;
  slideDir: "left" | "right" | null;
}) {
  const savedRef = useRef<ReactNode>(null);
  // Seed once from live children; never replace — replacing remounts and drops state.
  if (children != null && savedRef.current == null) {
    savedRef.current = children;
  }
  if (savedRef.current == null) return null;

  return (
    <div
      data-testid={`main-tab-panel-${href.slice(1)}`}
      data-active={active ? "true" : "false"}
      aria-hidden={!active}
      hidden={!active}
      style={{
        display: active ? "block" : "none",
        animation:
          active && slideDir
            ? `${slideDir === "left" ? "tabSlideFromRight" : "tabSlideFromLeft"} 220ms ease-out`
            : undefined,
      }}
    >
      {savedRef.current}
    </div>
  );
}

/**
 * Keep-alive main-tab host (PC-407): once a main tab has been visited, its React
 * tree stays mounted under `display: none` so sub-tab / client state survive.
 *
 * Only seed a slot when the browser URL agrees with `usePathname()` — otherwise
 * Schedule can be cached under the Feed panel during RSC/pathname skew.
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

  const [visited, setVisited] = useState<MainTabHref[]>([]);
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const startRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  /** Href whose live children are safe to seed (browser URL agrees with pathname). */
  const [seedHref, setSeedHref] = useState<MainTabHref | null>(null);

  useLayoutEffect(() => {
    if (!activeHref) {
      setSeedHref(null);
      return;
    }
    const browserHref = matchMainTab(window.location.pathname, visibleHrefs);
    if (browserHref !== activeHref) {
      setSeedHref(null);
      return;
    }
    setSeedHref(activeHref);
    setVisited((prev) => (prev.includes(activeHref) ? prev : [...prev, activeHref]));
  }, [activeHref, visibleHrefs]);

  const activeIndex = activeHref ? visibleHrefs.indexOf(activeHref) : 0;

  const goToIndex = useCallback(
    (nextIndex: number, dir: "left" | "right") => {
      if (nextIndex < 0 || nextIndex >= visibleHrefs.length) return;
      const href = visibleHrefs[nextIndex];
      if (!href || href === activeHref) return;
      setSlideDir(dir);
      router.push(href);
      window.setTimeout(() => setSlideDir(null), 240);
    },
    [activeHref, router, visibleHrefs],
  );

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.buttons !== 1) return;
    const modalOpen = Boolean(
      document.querySelector(".MuiModal-root, .MuiDialog-root, [role='dialog']"),
    );
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      ignore: modalOpen || isInteractiveOrHorizontalScroll(event.target),
    };
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || start.ignore || !onMainTab) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX) return;
      if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return;

      if (dx < 0) goToIndex(activeIndex + 1, "left");
      else goToIndex(activeIndex - 1, "right");
    },
    [activeIndex, goToIndex, onMainTab],
  );

  const onPointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  if (!onMainTab) {
    return <>{children}</>;
  }

  const slots = visibleHrefs.filter(
    (href) => visited.includes(href) || href === activeHref,
  );

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ minHeight: "inherit", touchAction: "pan-y", overflow: "hidden" }}
      data-testid="main-tab-carousel"
    >
      {slots.map((href) => {
        const isActive = href === activeHref;
        // Only the URL-confirmed active tab may receive live RSC children to seed.
        const live = isActive && seedHref === href ? children : null;
        return (
          <KeepAlivePanel
            key={href}
            href={href}
            active={isActive}
            slideDir={slideDir}
          >
            {live}
          </KeepAlivePanel>
        );
      })}
      <style>{`
        @keyframes tabSlideFromRight {
          from { transform: translateX(18%); opacity: 0.85; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes tabSlideFromLeft {
          from { transform: translateX(-18%); opacity: 0.85; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
