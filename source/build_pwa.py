"""Build the public, installable (offline-capable) version of the app into the repo root.

Same app code and data as the claude.ai artifact (site/), plus: a real HTML head, a web app
manifest, self-hosted fonts, icons, and a service worker that precaches every file so
the app works offline once opened. Run build_site.py first.
"""
import hashlib
import json
import os
import re
import shutil

SP = os.path.dirname(os.path.abspath(__file__))
SITE, SRC = os.path.join(SP, "site"), os.path.join(SP, "pwa-src")
# The published app lives one level up (the repo root); override with JUZAPP_OUT.
OUT = os.environ.get("JUZAPP_OUT") or os.path.dirname(SP)
DESC = "Memorize every surah in Juz 28, 29 and 30: sections on the real muṣḥaf pages, meanings, deeper explanations, self-tests and weak spots."

os.makedirs(OUT, exist_ok=True)
for sub in ("data", "fonts", "icons"):
    shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(os.path.join(OUT, sub))

shutil.copy(os.path.join(SITE, "app.js"), os.path.join(OUT, "app.js"))
index_js = open(os.path.join(SITE, "data", "index.js"), encoding="utf-8").read()
ready = json.loads(index_js.split("=", 1)[1].rstrip().rstrip(";"))["ready"]
shutil.copy(os.path.join(SITE, "data", "index.js"), os.path.join(OUT, "data", "index.js"))
for n in ready:
    shutil.copy(os.path.join(SITE, "data", f"s{n:03d}.js"), os.path.join(OUT, "data", f"s{n:03d}.js"))
for f in os.listdir(os.path.join(SRC, "fonts")):
    if f.endswith((".woff2", "fonts.css")):
        shutil.copy(os.path.join(SRC, "fonts", f), os.path.join(OUT, "fonts", f))
for f in os.listdir(os.path.join(SRC, "icons")):
    shutil.copy(os.path.join(SRC, "icons", f), os.path.join(OUT, "icons", f))

body = open(os.path.join(SITE, "index.html"), encoding="utf-8").read()
title = re.search(r"<title>.*?</title>", body).group(0)
body = body.replace(title, "", 1)
body = re.sub(r'<link rel="preconnect"[^>]*>\s*', "", body)
body = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\s*', "", body)

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{title}
<meta name="description" content="{DESC}">
<meta name="theme-color" content="#F6F1E4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#12110D" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Juz 28–30">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="stylesheet" href="fonts/fonts.css">
<style>
html,body{{margin:0}}
img{{max-width:100%}}
@media (display-mode: standalone){{.topbar{{padding-top:calc(.65rem + env(safe-area-inset-top))}}}}
</style>
</head>
<body>
{body}
<script>
if ("serviceWorker" in navigator && location.protocol === "https:") {{
  // When a new version takes over, reload once so the newest surahs and features show immediately.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {{
    if (hadController && !reloaded) {{ reloaded = true; location.reload(); }}
  }});
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}}
</script>
</body>
</html>
"""
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(html)

manifest = {
    "name": "Juz 28–30 Memory Map",
    "short_name": "Juz 28–30",
    "description": DESC,
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "background_color": "#F6F1E4",
    "theme_color": "#0E5A45",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8").write(json.dumps(manifest, ensure_ascii=False, indent=1))

assets = ["./", "index.html", "app.js", "manifest.webmanifest"]
for sub in ("data", "fonts", "icons"):
    assets += sorted(f"{sub}/{f}" for f in os.listdir(os.path.join(OUT, sub)))
h = hashlib.sha1()
for a in assets[1:]:
    h.update(open(os.path.join(OUT, a), "rb").read())
version = h.hexdigest()[:12]
sw = """/* Offline cache for Juz 28–30 Memory Map. The version changes whenever any file changes. */
const CACHE = "juzmap-%s";
const ASSETS = %s;
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
  const fresh = req.mode === "navigate" || url.pathname.endsWith("/") || /(index\\.html|app\\.js|data\\/index\\.js)$/.test(url.pathname);
  if (fresh) {
    e.respondWith(fetch(req).then(res => store(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => store(req, res))));
});
""" % (version, json.dumps(assets))
open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(sw)
open(os.path.join(OUT, ".nojekyll"), "w").write("")
open(os.path.join(OUT, "README.md"), "w", encoding="utf-8").write(
    "# Juz 28–30 Memory Map\n\n" + DESC + "\n\n"
    "Open it on your phone and choose **Add to Home Screen**. It works offline after the first visit.\n\n"
    "Quran text and muṣḥaf page layout: Quran Foundation (quran.com), fetched through quran-mcp. "
    "Translation: Sahih International. Explanations are condensed from classical tafsir "
    "(Ibn Kathīr, al-Saʿdī, al-Jalālayn, al-Baghawī, al-Qurṭubī, Maʿāriful Qurʾān).\n")
print(f"built {OUT}: {len(ready)} surahs, {len(assets)} cached files, version {version}")
