"use strict";
/* QuranFlow — app shell: routing, home screen, weak-spot store, surah loading. */
const IDX = window.JUZAPP_INDEX;
const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toAr = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
const pad = n => String(n).padStart(3, "0");
const nameOf = n => (IDX.surahs[n]?.name || `Surah ${n}`).replace(/'/g, "ʿ");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
// Pages flipping over while a surah opens from the list (kept on screen long enough to finish).
const flip = {
  t: 0,
  show() {
    if (reduceMotion) return;
    const el = $("flip");
    el.innerHTML = '<div class="stack"><div class="leaf"></div><div class="leaf"></div><div class="leaf"></div></div>';
    el.hidden = false; this.t = Date.now();
  },
  hide() {
    const el = $("flip");
    if (el.hidden) return;
    setTimeout(() => (el.hidden = true), Math.max(0, 800 - (Date.now() - this.t)));
  },
};
// The top bar and the bar pinned to the bottom both change height; on phones the surah scroller is sized to
// sit exactly between them, so nothing is ever covered by either.
const setTopbar = () => {
  const root = document.documentElement.style;
  root.setProperty("--topbar", document.querySelector(".topbar").offsetHeight + "px");
  const bar = [$("anav"), $("dock")].find(b => b && !b.hidden);
  root.setProperty("--bar", bar ? Math.max(0, Math.ceil(window.innerHeight - bar.getBoundingClientRect().top)) + "px" : "0px");
};
window.addEventListener("resize", setTopbar);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

/* ---------- weak spots: one document per surah in the artifact store, mirrored locally ---------- */
const Weak = {
  local: store.get("juzapp-weak-v1", {}),   // { "70": { "19": { count, last } } }
  db: null,
  firstSync: true,
  listeners: new Set(),
  count(n, a) { return this.local[n]?.[a]?.count || 0; },
  total(n) { return Object.keys(this.local[n] || {}).length; },
  mark(n, a) {
    const cur = this.local[n] || {};
    this.local = { ...this.local, [n]: { ...cur, [a]: { count: (cur[a]?.count || 0) + 1, last: new Date().toISOString() } } };
    this.save(n); this.emit();
  },
  clear(n, a) {
    const cur = { ...(this.local[n] || {}) };
    delete cur[a];
    this.local = { ...this.local, [n]: cur };
    this.save(n); this.emit();
  },
  save(n) {
    store.set("juzapp-weak-v1", this.local);
    if (!this.db) return;
    const ref = this.db.doc(`weakspots/s${pad(n)}`), body = { surah: Number(n), ayat: this.local[n] || {} };
    ref.set(body).catch(e => {
      if (e && e.code === "unavailable") setTimeout(() => ref.set(body).catch(() => {}), 600 + Math.random() * 900);
    });
  },
  clearSurah(n) {
    this.local = { ...this.local, [n]: {} };
    this.save(n); this.emit();
  },
  clearAll() {
    const ns = Object.keys(this.local).filter(n => Object.keys(this.local[n] || {}).length);
    this.local = Object.fromEntries(Object.keys(this.local).map(n => [n, {}]));
    ns.forEach(n => this.save(n));
    this.emit();
  },
  emit() { this.listeners.forEach(f => f()); },
  async connect() {
    const db = window.claude && window.claude.use ? await window.claude.use("db") : null;
    if (!db) return;
    this.db = db;
    db.collection("weakspots").onSnapshot(snap => {
      const next = { ...this.local }, toSave = [];
      const seen = new Set();
      snap.docs.forEach(d => {
        const body = d.data() || {};
        const n = String(body.surah || Number(d.id.slice(1)));
        seen.add(n);
        const remote = { ...(body.ayat || {}) };
        if (this.firstSync) {
          let carried = false;
          for (const [a, v] of Object.entries(this.local[n] || {})) {
            if ((remote[a]?.count || 0) < (v.count || 0)) { remote[a] = v; carried = true; }
          }
          if (carried) toSave.push(n);
        }
        next[n] = remote;
      });
      if (this.firstSync) {
        for (const n of Object.keys(this.local)) if (!seen.has(n) && Object.keys(this.local[n]).length) toSave.push(n);
        this.firstSync = false;
      }
      const changed = JSON.stringify(next) !== JSON.stringify(this.local);
      this.local = next;
      store.set("juzapp-weak-v1", this.local);
      toSave.forEach(n => this.save(n));
      if (changed) this.emit();
    }, () => {});
  },
};

/* ---------- "add to home screen" (the installed app only: the claude.ai copy has no manifest) ---------- */
const isPWA = !!document.querySelector('link[rel="manifest"]');
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const wantsInstall = new URLSearchParams(location.search).has("install");
if (wantsInstall) history.replaceState(null, "", location.pathname + location.hash);   // keep the query off the home-screen icon
let installPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; if (!$("home").hidden) installTip(); });
const SHARE_ICON = '<svg class="share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 12v8h14v-8"/></svg>';
function installTip() {
  const el = $("installTip");
  if (!el || !isPWA || standalone) return;
  const dismissed = store.get("qf-install-hint", false) && !wantsInstall;
  let body = "";
  if (installPrompt) body = `<p><b>Install QuranFlow as an app.</b> It opens full screen and works offline.</p>
    <div class="row"><button type="button" class="btn" id="installGo">Install</button><button type="button" class="btn ghost" id="installNo">Not now</button></div>`;
  else if (isIOS) body = `<p><b>Add QuranFlow to your home screen.</b> Tap the Share button ${SHARE_ICON} in Safari, then <b>Add to Home Screen</b>, then <b>Add</b>. It then opens full screen and works offline.</p>
    <div class="row"><button type="button" class="btn ghost" id="installNo">Got it</button></div>`;
  else if (wantsInstall) body = `<p><b>Add QuranFlow to your home screen.</b> In your browser's menu, choose <b>Add to Home screen</b> or <b>Install app</b>.</p>
    <div class="row"><button type="button" class="btn ghost" id="installNo">Got it</button></div>`;
  el.hidden = !body || dismissed;
  el.innerHTML = body;
  if ($("installGo")) $("installGo").onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; el.hidden = true; };
  if ($("installNo")) $("installNo").onclick = () => { store.set("qf-install-hint", true); el.hidden = true; };
}

/* ---------- home ---------- */
function chip(n, last) {
  const s = IDX.surahs[n], ready = IDX.ready.includes(n), w = Weak.total(n);
  const pages = s.pages[1] !== s.pages[0] ? `pages ${s.pages[0]}–${s.pages[1]}` : `page ${s.pages[0]}`;
  const note = w ? ` · <span class="weak">${w} weak spot${w > 1 ? "s" : ""}</span>` : ready ? "" : " · coming soon";
  return `<a class="chip${ready ? "" : " pending"}${n === last ? " last" : ""}" href="#${n}"${ready ? "" : ' aria-disabled="true" tabindex="-1"'}>
    <span class="jn">${n}</span>
    <span class="jtx"><span class="jen">${esc(nameOf(n))}</span><span class="jpg">${s.ayat} ayat · ${pages}${note}</span></span>
    <span class="jar" lang="ar">${esc(s.ar)}</span></a>`;
}
/* Destructive buttons ask for a second tap within 4 seconds instead of a pop-up. */
function armClear(btn, label, onConfirm) {
  if (!btn.dataset.armed) btn.textContent = label;
  btn.onclick = () => {
    if (btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove("armed"); onConfirm(); return; }
    btn.dataset.armed = "1"; btn.classList.add("armed"); btn.textContent = "Tap again to clear";
    setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove("armed"); btn.textContent = label; } }, 4000);
  };
}
function showHome() {
  $("home").hidden = false; $("surah").hidden = true;
  document.body.classList.remove("in-surah");
  $("homebtn").classList.add("here"); $("homebtn").setAttribute("aria-current", "page");
  $("feat").hidden = true; $("featMenu").hidden = true;
  $("crumb").innerHTML = ""; $("navbtns").innerHTML = "";
  Surah.leave();
  installTip();
  const last = store.get("juzapp-last", null);
  $("resume").innerHTML = last && IDX.ready.includes(last)
    ? `<div class="row" style="margin-top:.4rem"><a class="btn" href="#${last}">Continue with ${esc(nameOf(last))}</a></div>` : "";
  // Weak spots across the app, one link per surah into its Weak spots tab (clearing happens there, per surah).
  const withWeak = Object.keys(Weak.local).map(Number).filter(k => IDX.surahs[k] && Weak.total(k)).sort((a, b) => a - b);
  const allWeak = withWeak.reduce((sum, k) => sum + Weak.total(k), 0);
  if ($("weakSummary")) $("weakSummary").innerHTML = allWeak ? `<div class="wsum"><span class="lbl red">Your weak spots · ${allWeak} in ${withWeak.length} surah${withWeak.length > 1 ? "s" : ""}</span>
    <div class="wsumrows">${withWeak.map(k => `<a href="#${k}/weak">${k}. ${esc(nameOf(k))}<b>${Weak.total(k)}</b></a>`).join("")}</div></div>` : "";
  // Every juz the app covers, in order. A surah that runs across two juz is listed under the first.
  const listed = new Set(), nums = Object.keys(IDX.juz).map(Number).sort((a, b) => a - b);
  const blocks = nums.map(j => {
    const J = IDX.juz[j], list = J.surahs.filter(n => IDX.surahs[n] && !listed.has(n));
    list.forEach(n => listed.add(n));
    return list.length ? `<div class="juzblock"><h2>Juz ${j}<span class="src">pages ${J.pages[0]}–${J.pages[1]} · ${list.length} surah${list.length > 1 ? "s" : ""}</span></h2>
      <div class="chips">${list.map(n => chip(n, last)).join("")}</div></div>` : "";
  });
  const soon = nums[0] > 1 ? `<div class="soon"><b>Juz 1${nums[0] > 2 ? `–${nums[0] - 1}` : ""}</b><span>Coming soon</span></div>` : "";
  $("juzList").innerHTML = soon + blocks.join("");
}

/* ---------- surah loading + routing ---------- */
const loading = {};
function loadSurah(n) {
  if (window.JUZAPP_SURAH?.[n]) return Promise.resolve(window.JUZAPP_SURAH[n]);
  if (loading[n]) return loading[n];
  loading[n] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `data/s${pad(n)}.js`;
    s.onload = () => (window.JUZAPP_SURAH?.[n] ? resolve(window.JUZAPP_SURAH[n]) : reject(new Error("empty")));
    s.onerror = () => { delete loading[n]; s.remove(); reject(new Error("load failed")); };
    document.head.appendChild(s);
  });
  return loading[n];
}
let routeToken = 0;
async function openSurah(n, tab) {
  const token = ++routeToken;
  if (!$("home").hidden && Surah.n !== n) flip.show();
  $("home").hidden = true; $("surah").hidden = false;
  document.body.classList.add("in-surah");
  $("homebtn").classList.remove("here"); $("homebtn").removeAttribute("aria-current");   // now a clear way back to every surah
  $("feat").hidden = false;
  if (Surah.n !== n) {
    $("surahBody").hidden = true; $("loading").hidden = false; $("loading").textContent = "Loading…";
    window.scrollTo(0, 0);
  }
  let data;
  try { data = await loadSurah(n); }
  catch (e) { if (token === routeToken) { $("loading").textContent = "This surah couldn’t load. Check your connection, then reload the page."; flip.hide(); } return; }
  if (token !== routeToken) return;
  store.set("juzapp-last", n);
  const s = IDX.surahs[n];
  // Surah arrows with names, the open surah between them (next surah on the left, as in the muṣḥaf).
  const empty = `<span class="nb-empty"></span>`;
  const later = IDX.ready.includes(n + 1) ? `<a href="#${n + 1}" aria-label="Next surah: ${esc(nameOf(n + 1))}">‹ ${n + 1} ${esc(nameOf(n + 1))}</a>` : empty;
  const earlier = IDX.ready.includes(n - 1) ? `<a href="#${n - 1}" aria-label="Previous surah: ${esc(nameOf(n - 1))}">${n - 1} ${esc(nameOf(n - 1))} ›</a>` : empty;
  $("crumb").innerHTML = "";
  $("navbtns").innerHTML = `${later}<span class="here" aria-current="page" title="Juz ${s.juz[0]}">${n} ${esc(nameOf(n))}</span>${earlier}`;
  const fresh = Surah.n !== n;
  if (fresh) {
    try { Surah.mount(n, data); }
    catch (e) { $("loading").textContent = "This surah couldn’t open. Please try another one."; console.error(e); flip.hide(); return; }
  }
  $("loading").hidden = true; $("surahBody").hidden = false;
  if (fresh) { $("stage").scrollTop = 0; Surah.syncBar(); }   // phones: a new surah starts on its first screen (only works once it is visible)
  if (tab) Surah.setTab(tab);   // e.g. #70/weak opens straight into that surah's weak spots
  setTopbar();
  flip.hide();
}
function route() {
  const m = location.hash.match(/^#(\d{1,3})(?:\/(ayah|section|weak))?$/);
  const n = m ? Number(m[1]) : null;
  if (n && IDX.ready.includes(n)) openSurah(n, m[2]); else showHome();
  requestAnimationFrame(setTopbar);
}
