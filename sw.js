/* Offline cache for Juz 28–30 Memory Map. The version changes whenever any file changes. */
const CACHE = "juzmap-8262adcc30e5";
const ASSETS = ["./", "index.html", "app.js", "manifest.webmanifest", "data/index.js", "data/s058.js", "data/s059.js", "data/s060.js", "data/s061.js", "data/s062.js", "data/s063.js", "data/s064.js", "data/s065.js", "data/s066.js", "data/s067.js", "data/s068.js", "data/s069.js", "data/s070.js", "data/s071.js", "data/s072.js", "data/s073.js", "data/s074.js", "data/s075.js", "data/s076.js", "data/s077.js", "data/s078.js", "data/s079.js", "data/s080.js", "data/s081.js", "data/s082.js", "data/s083.js", "data/s084.js", "data/s085.js", "data/s086.js", "data/s087.js", "data/s090.js", "data/s091.js", "data/s092.js", "data/s098.js", "data/s099.js", "data/s100.js", "data/s101.js", "data/s102.js", "data/s103.js", "fonts/Alegreya-normal-700-latin-ext.woff2", "fonts/Alegreya-normal-700-latin.woff2", "fonts/AlegreyaSans-italic-400-latin-ext.woff2", "fonts/AlegreyaSans-italic-400-latin.woff2", "fonts/AlegreyaSans-normal-400-latin-ext.woff2", "fonts/AlegreyaSans-normal-400-latin.woff2", "fonts/AlegreyaSans-normal-500-latin-ext.woff2", "fonts/AlegreyaSans-normal-500-latin.woff2", "fonts/AlegreyaSans-normal-700-latin-ext.woff2", "fonts/AlegreyaSans-normal-700-latin.woff2", "fonts/AmiriQuran-normal-400-arabic.woff2", "fonts/AmiriQuran-normal-400-latin.woff2", "fonts/fonts.css", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("juzmap-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match("index.html")))
  );
});
