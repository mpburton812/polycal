"use client";

import { useEffect, useRef } from "react";

/**
 * Registers the device for Web Push when the user grants permission (PC-43).
 */
export function PushSubscriptionManager({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const attempted = useRef(false);

  useEffect(() => {
    if (!vapidPublicKey || attempted.current) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    attempted.current = true;

    void (async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
        }

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch {
        // Push is optional; inbox still works without device delivery.
      }
    })();
  }, [vapidPublicKey]);

  return null;
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
