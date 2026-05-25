const TOPAC_CACHE_CLEANUP = "topac-cache-cleanup-20260525";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if ("caches" in self) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(
        clients.map((client) => {
          try {
            client.postMessage({ type: TOPAC_CACHE_CLEANUP });
            return client.navigate(client.url);
          } catch {
            return undefined;
          }
        })
      );
      await self.registration.unregister();
    })()
  );
});
