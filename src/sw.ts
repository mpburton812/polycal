/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

import { Serwist } from "serwist";



declare global {

  interface WorkerGlobalScope extends SerwistGlobalConfig {

    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;

  }

}



declare const self: ServiceWorkerGlobalScope;



const serwist = new Serwist({

  precacheEntries: self.__SW_MANIFEST,

  skipWaiting: true,

  clientsClaim: true,

  navigationPreload: true,

  runtimeCaching: defaultCache,

});



serwist.addEventListeners();



/** Urgent partnership/residency/enforcement alerts stay visible until dismissed (PC-58). */

function requiresInteraction(notificationType?: string): boolean {

  if (!notificationType) return false;

  if (notificationType.startsWith("partnership")) return true;

  if (notificationType.startsWith("residency")) return true;

  if (notificationType.includes("enforcement")) return true;

  if (

    notificationType.startsWith("proposal_at_risk") ||

    notificationType.startsWith("proposal_expired") ||

    notificationType.startsWith("proposal_redraft") ||

    notificationType.startsWith("proposal_at_risk_cancelled")

  ) {

    return true;

  }

  return false;

}



self.addEventListener("push", (event) => {

  const fallback = { title: "PolyCal", body: "You have a new notification.", url: "/" };

  let payload: Record<string, string | undefined> = fallback;

  try {

    payload = { ...fallback, ...(event.data?.json() as Record<string, string>) };

  } catch {

    payload = fallback;

  }



  const targetUrl = payload.url ?? "/";

  // `actions` and `proposalId` arrive as parsed JSON on the payload; cast the
  // loosely-typed record to read them for inline action buttons (Accept / Open).
  const raw = payload as unknown as {
    actions?: { action: string; title: string }[];
    proposalId?: string;
  };
  const actions = Array.isArray(raw.actions) ? raw.actions.slice(0, 2) : undefined;

  event.waitUntil(

    self.registration.showNotification(payload.title ?? fallback.title, {

      body: payload.body ?? fallback.body,

      icon: "/icons/icon-192.png",

      requireInteraction: requiresInteraction(payload.notificationType),

      ...(actions ? { actions } : {}),

      data: { url: targetUrl, proposalId: raw.proposalId },

    }),

  );

});



self.addEventListener("notificationclick", (event) => {

  event.notification.close();

  const data = (event.notification.data ?? {}) as {
    url?: string;
    proposalId?: string;
  };
  const targetUrl = data.url ?? "/";

  // Inline "Accept" action: POST the accept vote from the service worker using
  // the recipient's cookie session, then focus/open the app. Falls through to a
  // normal open on failure so the user can act manually.
  if (event.action === "accept" && data.proposalId) {
    event.waitUntil(
      fetch("/api/notifications/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proposalId: data.proposalId }),
      })
        .catch(() => undefined)
        .then(() => focusOrOpen(targetUrl)),
    );
    return;
  }

  event.waitUntil(focusOrOpen(targetUrl));

});



/** Focuses an existing app window (navigating it) or opens a new one. */
async function focusOrOpen(targetUrl: string): Promise<void> {

  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of clientList) {
    if ("focus" in client) {
      const windowClient = client as WindowClient;
      const navigated = await windowClient.navigate(targetUrl);
      (navigated ?? windowClient).focus();
      return;
    }
  }

  await self.clients.openWindow(targetUrl);

}

