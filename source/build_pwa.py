"""Build the public, installable (offline-capable) version of the app into the repo root.

Same app code and data as the claude.ai artifact (site/), plus: a real HTML head, a web app
manifest, self-hosted fonts, icons, and a service worker that precaches the app shell and keeps each
surah offline once it has been opened. Run build_site.py first.
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
DESC = "Memorize the Quran surah by surah: sections on the real muṣḥaf pages, meanings, deeper explanations, self-tests and weak-spot practice."

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
# The page names the exact script version it was built with (?v=…), so a page and script cached at
# different times can never be mixed: an old page keeps loading its old script, a new page its new one.
h = hashlib.sha1()
for f in ["app.js", "data/index.js"] + [f"data/s{n:03d}.js" for n in ready]:
    h.update(open(os.path.join(OUT, f), "rb").read())
codever = h.hexdigest()[:10]
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
body = body.replace('<script src="data/index.js"></script>', f'<script src="data/index.js?v={codever}"></script>', 1)
body = body.replace('<script src="app.js"></script>', f'<script src="app.js?v={codever}"></script>', 1)
# the opening's basmala, written into the page from the muṣḥaf data so it shows before any script runs
BASMALA = json.load(open(os.path.join(SP, "raw", "basmala.json"), encoding="utf-8"))["basmala"]
body = body.replace('<div class="bism" lang="ar" id="splashBism"></div>', f'<div class="bism" lang="ar" id="splashBism">{BASMALA}</div>', 1)

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
<meta name="apple-mobile-web-app-title" content="QuranFlow">
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
    "name": "QuranFlow",
    "short_name": "QuranFlow",
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

# A page to send people: what the app is and how to put it on a home screen (iPhone has no install prompt).
INSTALL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Add QuranFlow to your home screen</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#F6F1E4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#12110D" media="(prefers-color-scheme: dark)">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="stylesheet" href="fonts/fonts.css">
<style>
:root{{--paper:#F6F1E4;--sheet:#FFFDF6;--ink:#1C1A17;--muted:#6B6453;--line:#E2D8C0;--gold:#8E6E33;--green:#0E5A45;
  --ui:"Alegreya Sans","Gill Sans","Segoe UI",system-ui,sans-serif;--display:"Alegreya",Georgia,"Times New Roman",serif;--q:"Amiri Quran","Amiri","Scheherazade New","Noto Naskh Arabic",serif}}
@media (prefers-color-scheme:dark){{:root{{--paper:#12110D;--sheet:#1B1A15;--ink:#ECE5D2;--muted:#A89F8A;--line:#34302A;--gold:#CDAE72;--green:#72C3A0}}}}
*{{box-sizing:border-box}}
html,body{{margin:0}}
body{{background:var(--paper);color:var(--ink);font:400 1.05rem/1.55 var(--ui);padding-inline:clamp(16px,4vw,32px);padding-block:2rem 3rem}}
.wrap{{max-width:34rem;margin:0 auto;display:grid;gap:1.1rem;justify-items:start}}
.top{{display:flex;align-items:center;gap:1rem}}
.icon{{width:76px;height:76px;border-radius:18px;box-shadow:0 8px 22px rgba(0,0,0,.18)}}
h1{{margin:0;font:700 2.1rem/1.05 var(--display)}}
h1 span{{display:block;font:400 1.2rem/1.4 var(--q);color:var(--green)}}
.lead{{margin:0;max-width:60ch;color:var(--muted)}}
.btn{{display:inline-block;background:var(--ink);color:var(--paper);text-decoration:none;font-weight:700;border-radius:10px;padding:.8rem 1.3rem;font-size:1.05rem}}
.card{{width:100%;background:var(--sheet);border:1px solid var(--line);border-radius:12px;padding:1rem 1.15rem;display:grid;gap:.5rem}}
.card.first{{border-color:var(--green)}}
h2{{margin:0;font:700 1.2rem/1.3 var(--display)}}
ol{{margin:0;padding-inline-start:1.3rem;display:grid;gap:.45rem}}
.share{{display:inline-block;vertical-align:-.15em;width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}}
.note{{margin:0;font-size:.9rem;color:var(--muted)}}
</style>
</head>
<body>
<main class="wrap">
  <div class="top"><img class="icon" src="icons/icon-192.png" alt=""><h1>QuranFlow<span lang="ar">حفظ</span></h1></div>
  <p class="lead">{desc}</p>
  <a class="btn" href="./?install">Open QuranFlow</a>
  <section class="card" id="ios">
    <h2>On iPhone or iPad</h2>
    <ol>
      <li>Tap <b>Open QuranFlow</b> above (in Safari).</li>
      <li>Tap the <b>Share</b> button <svg class="share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 12v8h14v-8"/></svg> at the bottom of the screen.</li>
      <li>Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
    </ol>
  </section>
  <section class="card" id="android">
    <h2>On Android</h2>
    <ol>
      <li>Tap <b>Open QuranFlow</b> above (in Chrome).</li>
      <li>Tap <b>Install</b> when the app offers it, or open the browser menu <b>⋮</b> and choose <b>Add to Home screen</b>.</li>
    </ol>
  </section>
  <p class="note">It opens full screen like an app and works offline after the first visit. Already added it? Open it from your home screen.</p>
</main>
<script>
// put the reader's own platform first; if this is already the installed app, go straight in
if (matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) location.replace("./");
var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var first = document.getElementById(ios ? "ios" : "android"), other = document.getElementById(ios ? "android" : "ios");
first.classList.add("first"); other.parentNode.insertBefore(first, other);
</script>
</body>
</html>
"""
open(os.path.join(OUT, "install.html"), "w", encoding="utf-8").write(INSTALL.format(desc=DESC))

assets = ["./", "index.html", "install.html", "app.js", "manifest.webmanifest"]
for sub in ("data", "fonts", "icons"):
    assets += sorted(f"{sub}/{f}" for f in os.listdir(os.path.join(OUT, sub)))
h = hashlib.sha1()
for a in assets[1:]:
    h.update(open(os.path.join(OUT, a), "rb").read())
version = h.hexdigest()[:12]
# Precache the app shell only; each surah is cached the first time it is opened (the whole Quran is too much to
# download at install). The version still covers every file, so changed surah data replaces the old cache.
precache = [a for a in assets if not re.match(r"data/s\d{3}\.js$", a)]
sw = """/* Offline cache for QuranFlow. The version changes whenever any file changes. */
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
    // always ask the server whether these changed (a conditional request), so a new version shows up at once
    e.respondWith(fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then(res => store(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => store(req, res))));
});
""" % (version, json.dumps(precache))
open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(sw)
open(os.path.join(OUT, ".nojekyll"), "w").write("")
README = """# QuranFlow

{desc} Covers Juz 25–30 so far.

**Open the app:** https://ahmed-ashmaig.github.io/juz-memory-map/

On your phone, choose **Add to Home Screen**. It works offline after the first visit.

## What's inside

- **All surahs:** every surah from Fuṣṣilat (41) to An-Nās (114), listed top to bottom in muṣḥaf order and grouped by juz. Fuṣṣilat starts in Juz 24 but is included whole. Juz 1–24 are coming soon.
- Inside a surah, the **▾ menu** at the top picks one part at a time:
  - **Learn:** opens with the surah's main theme, with why it was revealed and where it sits in the Quran and in its juz one tap away. Learn always sits on an ayah, starting at ayah 1, lit up on the real muṣḥaf page; a bar under the pages shows which page you're on. A bar pinned to the bottom of the screen steps forward and back and marks weak spots; you can also tap any word to jump there. The panel has three tabs: **Ayah** (the ayah with the ayah before and after), **Section** (the section with its meaning, memory hook, key points, ayah-by-ayah notes and deeper background, between the sections before and after), and **Weak spots** (every ayah you've marked, with a memory aid for each and a practice drill: read the two ayat before it, recite it, read the one after, then say how it went; five passes in a row clears the spot, and when the surah is clear it sends you back to recite the whole thing).
  - **Test me:** recite from memory and reveal one ayah at a time, with the next ayah's first word as your cue. Tap "I'm stuck" to mark a weak spot.
  - **Quiz:** see an ayah and find which section it belongs to.
  - **Similars:** look-alike ayat in the surah and across the Quran, with cues for telling them apart.
- **Weak spots** you mark are saved on your device and show in red everywhere. The home screen counts them per surah and links to each surah's Weak spots tab.

## Sources

Quran text and muṣḥaf page layout come from the Quran Foundation (quran.com), fetched through quran-mcp. The translation is Sahih International. Explanations are condensed from classical tafsir: Ibn Kathīr, al-Saʿdī, al-Jalālayn, al-Baghawī, al-Qurṭubī and Maʿāriful Qurʾān.

## Building it

The build pipeline and content live in [`source/`](source/README.md).
"""
open(os.path.join(OUT, "README.md"), "w", encoding="utf-8").write(README.format(desc=DESC))
print(f"built {OUT}: {len(ready)} surahs, {len(precache)} precached files of {len(assets)}, version {version}")
