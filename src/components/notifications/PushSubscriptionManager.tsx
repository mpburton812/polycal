"use client";

import { useEffect, useRef } from "react";

import { syncExistingPushSubscription } from "@/lib/push-client";

/**
 * Keeps an existing Web Push subscription in sync when the user has opted in (PC-58).
 * Never prompts for Notification permission — opt-in happens from Profile settings.
 */
export function PushSubscriptionManager({
  vapidPublicKey,
  pushEnabled,
}: {
  vapidPublicKey: string | null;
  pushEnabled: boolean;
}) {
  const lastSyncKey = useRef<string | null>(null);

  useEffect(() => {
    if (!vapidPublicKey || !pushEnabled) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const syncKey = `${vapidPublicKey}:push`;
    if (lastSyncKey.current === syncKey) return;
    lastSyncKey.current = syncKey;

    void syncExistingPushSubscription(vapidPublicKey).catch(() => {
      // Push is optional; inbox still works without device delivery.
    });
  }, [vapidPublicKey, pushEnabled]);

  return null;
}
