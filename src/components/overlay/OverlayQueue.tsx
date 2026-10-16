"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** Higher entries win. A forced reload beats operator notices (PC-540). */
const OVERLAY_ORDER = ["pwa-update", "motd", "platform-log", "calendar-sync"] as const;

export type OverlayId = (typeof OVERLAY_ORDER)[number];

type OverlayContextValue = {
  claim: (id: OverlayId, active: boolean) => void;
  visible: OverlayId | null;
};

const OverlayContext = createContext<OverlayContextValue | null>(null);

/**
 * One slot for shell popups so MOTD, platform alerts, calendar failures, and
 * the PWA update gate do not stack (PC-540).
 */
export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Partial<Record<OverlayId, boolean>>>({});

  const claim = useCallback((id: OverlayId, on: boolean) => {
    setActive((prev) => (prev[id] === on ? prev : { ...prev, [id]: on }));
  }, []);

  const visible = useMemo(
    () => OVERLAY_ORDER.find((id) => active[id]) ?? null,
    [active],
  );

  const value = useMemo(() => ({ claim, visible }), [claim, visible]);
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

/**
 * Claims a slot while `wants` is true. Returns whether this host may render.
 * Without a provider, the host renders so public pages keep working.
 */
export function useOverlaySlot(id: OverlayId, wants: boolean): boolean {
  const ctx = useContext(OverlayContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.claim(id, wants);
    return () => ctx.claim(id, false);
  }, [ctx, id, wants]);
  if (!ctx) return wants;
  return wants && ctx.visible === id;
}
