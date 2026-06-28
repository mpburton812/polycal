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

  event.waitUntil(

    self.registration.showNotification(payload.title ?? fallback.title, {

      body: payload.body ?? fallback.body,

      icon: "/icons/icon-192.png",

      requireInteraction: requiresInteraction(payload.notificationType),

      data: { url: targetUrl },

    }),

  );

});



self.addEventListener("notificationclick", (event) => {

  event.notification.close();

  const targetUrl = (event.notification.data?.url as string | undefined) ?? "/";



  event.waitUntil(

    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {

      for (const client of clientList) {
        if ("focus" in client) {
          const windowClient = client as WindowClient;
          return windowClient
            .navigate(targetUrl)
            .then((navigated) => navigated?.focus() ?? windowClient.focus());
        }
      }

      return self.clients.openWindow(targetUrl);

    }),

  );

});

