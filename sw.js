/* Offline cache for QuranFlow. The version changes whenever any file changes. */
const CACHE = "juzmap-9aae8c06b07e";
const ASSETS = ["./", "index.html", "app.js", "manifest.webmanifest", "data/index.js", "data/s041.js", "data/s042.js", "data/s043.js", "data/s044.js", "data/s045.js", "data/s046.js", "data/s047.js", "data/s048.js", "data/s049.js", "data/s050.js", "data/s051.js", "data/s052.js", "data/s053.js", "data/s054.js", "data/s055.js", "data/s056.js", "data/s057.js", "data/s058.js", "data/s059.js", "data/s060.js", "data/s061.js", "data/s062.js", "data/s063.js", "data/s064.js", "data/s065.js", "data/s066.js", "data/s067.js", "data/s068.js", "data/s069.js", "data/s070.js", "data/s071.js", "data/s072.js", "data/s073.js", "data/s074.js", "data/s075.js", "data/s076.js", "data/s077.js", "data/s078.js", "data/s079.js", "data/s080.js", "data/s081.js", "data/s082.js", "data/s083.js", "data/s084.js", "data/s085.js", "data/s086.js", "data/s087.js", "data/s088.js", "data/s089.js", "data/s090.js", "data/s091.js", "data/s092.js", "data/s093.js", "data/s094.js", "data/s095.js", "data/s096.js", "data/s097.js", "data/s098.js", "data/s099.js", "data/s100.js", "data/s101.js", "data/s102.js", "data/s103.js", "data/s104.js", "data/s105.js", "data/s106.js", "data/s107.js", "data/s108.js", "data/s109.js", "data/s110.js", "data/s111.js", "data/s112.js", "data/s113.js", "data/s114.js", "fonts/Alegreya-normal-700-latin-ext.woff2", "fonts/Alegreya-normal-700-latin.woff2", "fonts/AlegreyaSans-italic-400-latin-ext.woff2", "fonts/AlegreyaSans-italic-400-latin.woff2", "fonts/AlegreyaSans-normal-400-latin-ext.woff2", "fonts/AlegreyaSans-normal-400-latin.woff2", "fonts/AlegreyaSans-normal-500-latin-ext.woff2", "fonts/AlegreyaSans-normal-500-latin.woff2", "fonts/AlegreyaSans-normal-700-latin-ext.woff2", "fonts/AlegreyaSans-normal-700-latin.woff2", "fonts/AmiriQuran-normal-400-arabic.woff2", "fonts/AmiriQuran-normal-400-latin.woff2", "fonts/fonts.css", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
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
