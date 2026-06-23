/**
 * Drops cached PWA assets and reloads so the browser pulls the latest deploy
 * for the current environment (feature, dev, test, or production).
 */
export async function forceReloadToLatestVersion(): Promise<void> {
  if (typeof window === "undefined") return;

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        await registration.update();
        await registration.unregister();
      }),
    );
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_refresh", String(Date.now()));
  window.location.replace(url.toString());
}
