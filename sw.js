/* QuranFlow moved to /QuranFlow/. This replaces the old site's service worker: it deletes the old offline copy,
   removes itself, and sends any open page to the new address. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("juzmap-")) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) {
    const u = new URL(c.url);
    c.navigate(u.origin + u.pathname.replace(/^\/juz-memory-map(?=\/|$)/i, "/QuranFlow") + u.search + u.hash).catch(() => {});
  }
})()));
