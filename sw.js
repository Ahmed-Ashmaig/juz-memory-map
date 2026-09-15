/* Offline cache for QuranFlow. The version changes whenever any file changes. */
const CACHE = "juzmap-5f127480496c";
const ASSETS = ["./", "index.html", "install.html", "app.js", "manifest.webmanifest", "data/index.js", "fonts/Alegreya-normal-700-latin-ext.woff2", "fonts/Alegreya-normal-700-latin.woff2", "fonts/AlegreyaSans-italic-400-latin-ext.woff2", "fonts/AlegreyaSans-italic-400-latin.woff2", "fonts/AlegreyaSans-normal-400-latin-ext.woff2", "fonts/AlegreyaSans-normal-400-latin.woff2", "fonts/AlegreyaSans-normal-500-latin-ext.woff2", "fonts/AlegreyaSans-normal-500-latin.woff2", "fonts/AlegreyaSans-normal-700-latin-ext.woff2", "fonts/AlegreyaSans-normal-700-latin.woff2", "fonts/AmiriQuran-normal-400-arabic.woff2", "fonts/AmiriQuran-normal-400-latin.woff2", "fonts/fonts.css", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("juzmap-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const store = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // The page, the app code and the surah list come from the network when online, so new surahs show up
  // straight away; everything else (surah data, fonts, icons) is served from the offline cache first.
  const fresh = req.mode === "navigate" || url.pathname.endsWith("/") || /(index\.html|app\.js|data\/index\.js)$/.test(url.pathname);
  if (fresh) {
    // always ask the server whether these changed (a conditional request), so a new version shows up at once
    e.respondWith(fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then(res => store(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => store(req, res))));
});
