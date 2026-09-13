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
// The top bar is sticky and changes height between screens; scroll snapping and anchors offset by it.
const setTopbar = () => document.documentElement.style.setProperty("--topbar", document.querySelector(".topbar").offsetHeight + "px");
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
  if (fresh) $("stage").scrollTop = 0;   // phones: a new surah starts on its first screen (only works once it is visible)
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

/* Surah view: muṣḥaf pages, section list, Learn (Ayah / Section / Weak spots) / Test me / Quiz / Similars. */
const Surah = (() => {
  let n = null, D = null, C = null, meta = null, N = 0, S = [], AY = {};
  let mode = "learn", sel = 1, cur = 1, revealed = 0;   // Learn always sits on a current ayah
  let quizA = 0, lastQuiz = 0, answered = false, lastOk = false;
  let REP = {};   // ayah -> repeat group from data (ayat repeated within this surah)
  let simSel = 0;       // Similars: selected group
  const score = [0, 0];
  const stuckThisPass = new Set();
  const openGroups = new Set();
  const openFolds = new Set(store.get("juzapp-folds", []));   // which folded rows of the section card stay open
  const TABS = ["ayah", "section", "weak"];
  let ltab = store.get("juzapp-ltab", "ayah");                // Learn panel tab: ayah | section | weak
  if (!TABS.includes(ltab)) ltab = ltab === "around" ? "section" : "ayah";
  // Weak-spot practice: the spot being drilled, the steps around it, and how many passes in a row (kept per ayah).
  let drill = null, drillNote = "", allClear = false;
  const streaks = store.get("juzapp-streak-v1", {});
  const PASSES = 5;

  // The intro card's folded rows (why it was revealed, where it sits) remember their state the same way.
  // "Where it sits" starts open (remembered as "!where" once someone closes it); the other rows start closed.
  const openByDefault = id => id === "where";
  document.querySelectorAll("#sHead details.fold").forEach(d => {
    const id = d.dataset.f;
    d.open = openByDefault(id) ? !openFolds.has("!" + id) : openFolds.has(id);
    d.addEventListener("toggle", () => {
      if (openByDefault(id)) { if (d.open) openFolds.delete("!" + id); else openFolds.add("!" + id); }
      else if (d.open) openFolds.add(id); else openFolds.delete(id);
      store.set("juzapp-folds", [...openFolds]);
      if (d.open && id === "where") centerIn($("jline").parentElement, $("jline").querySelector(".me"));
    });
  });

  /* ---------- the bar pinned to the bottom of the screen (Learn) ---------- */
  // Ayah tab steps by ayah, Section tab by section, Weak spots tab through the practice steps. Past either end: next surah.
  function stepLearn(dir) {
    if (ltab === "weak") {
      if (drill) { if (!drill.done) drillStep(dir); return; }
      if (dir > 0 && weakList().length) return startDrill(weakList()[0]);
      if (dir > 0 && allClear) { sel = 1; allClear = false; return setMode("test"); }   // every spot passed: recite it all
    } else if (ltab === "ayah") {
      if (cur + dir >= 1 && cur + dir <= N) return openAyah(cur + dir, true, "ayah");
    } else if (sel + dir >= 1 && sel + dir <= S.length) return openAyah(S[sel + dir - 1].a, true, "section");
    if (IDX.ready.includes(n + dir)) location.hash = "#" + (n + dir);
  }
  $("a-prev").onclick = () => (drill && drill.done ? drillAnswer(false) : stepLearn(-1));
  $("a-next").onclick = () => (drill && drill.done ? drillAnswer(true) : stepLearn(1));
  $("a-mark").onclick = () => (weak(cur) ? Weak.clear(n, cur) : Weak.mark(n, cur));
  $("a-view").onclick = () => setTab("weak");
  $("a-where").onclick = () => {
    const P = $("panel");
    if (P.scrollHeight > P.clientHeight) P.scrollTo({ top: 0, behavior: "smooth" });
    else P.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  const secOf = a => S.find(s => a >= s.a && a <= s.b);
  const groupOf = a => C.groups.find(g => a >= g.a && a <= g.b);
  const key = a => `${n}:${a}`;
  const surahOfKey = k => Number(k.split(":")[0]);
  const text = k => AY[k]?.words.join(" ") || D.edges?.[k]?.text || "";
  const meaning = k => (k.startsWith(`${n}:`) ? D.tr[k.split(":")[1]] : D.edges?.[k]?.tr) || "";
  const pos = k => (AY[k] ? `p.${AY[k].start[0]} line ${AY[k].start[1]}` : D.edges?.[k] ? `p.${D.edges[k].page}` : "");
  const prevKey = a => (a === 1 ? meta.prev : key(a - 1));
  const nextKey = a => (a === N ? meta.next : key(a + 1));
  const weak = a => Weak.count(n, a);
  const weakList = () => range(1, N).filter(a => weak(a));
  const streakOf = a => streaks[key(a)] || 0;
  const ayatLabel = (a, b) => (a === b ? `ayah ${a}` : `ayat ${a}–${b}`);
  const firstSentence = t => { const m = String(t || "").match(/^.*?[.!?](\s|$)/); return m ? m[0].trim() : String(t || ""); };
  const whyBox = x => (x && x.why ? `<div class="whyr"><b>Why it was revealed</b><p>${esc(x.why)}</p></div>` : "");

  function centerIn(container, el, behavior = "smooth") {
    if (!container || !el || container.scrollWidth <= container.clientWidth + 4) return;
    const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    container.scrollBy({ left: r.left + r.width / 2 - (c.left + c.width / 2), behavior });
  }
  // Scroll only when the target is mostly out of view, so stepping through ayat keeps the pages still.
  function showIn(container, el, behavior) {
    if (!container || !el) return;
    const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    const visible = Math.min(r.right, c.right) - Math.max(r.left, c.left);
    if (visible < Math.min(r.width, c.width) * 0.9) centerIn(container, el, behavior);
  }
  // Same idea for the vertical section list.
  function revealY(container, el) {
    if (!container || !el || container.scrollHeight <= container.clientHeight + 4) return;
    const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < c.top) container.scrollBy({ top: r.top - c.top - 4, behavior: "smooth" });
    else if (r.bottom > c.bottom) container.scrollBy({ top: r.bottom - c.bottom + 4, behavior: "smooth" });
  }
  const scrollToPage = p => showIn($("pages"), $("p" + p));

  /* ---------- pages ⇄ section list ⇄ page bar, kept in step ---------- */
  let viewPage = 0, onPageSecs = new Set();
  function pageInView() {
    const box = $("pages").getBoundingClientRect(), mid = box.left + box.width / 2;
    const el = [...$("pages").children].find(el => { const r = el.getBoundingClientRect(); return r.left <= mid && r.right >= mid; });
    return el ? +el.id.slice(1) : viewPage;
  }
  // The section list keeps every section; the ones on the page in view stand out, and the list scrolls to them.
  function syncStrip(force) {
    if (!D) return;
    const p = pageInView(), moved = p !== viewPage;
    if (!force && !moved) return;
    viewPage = p;
    onPageSecs = new Set(S.filter(s => s.from[0] <= p && s.to[0] >= p).map(s => s.n));
    paintStrip();
    paintPagebar();
    tintOnPage();
    const strip = $("strip"), first = S.find(s => onPageSecs.has(s.n));
    if (moved && first && strip.scrollHeight > strip.clientHeight + 4) {
      // show the page's sections from the first one down, but never let the selected one slip out of view
      const top = $("blk" + first.n).getBoundingClientRect().top - strip.getBoundingClientRect().top + strip.scrollTop - 4;
      const selB = onPageSecs.has(sel) ? $("blk" + sel).getBoundingClientRect().bottom - strip.getBoundingClientRect().top + strip.scrollTop + 4 : 0;
      strip.scrollTo({ top: Math.max(top, selB - strip.clientHeight), behavior: "smooth" });
    }
  }
  // As the pages move, tint the words of the sections now in view (the solid selection is left alone).
  function tintOnPage() {
    if (mode !== "learn") return;
    document.querySelectorAll("#pages .w.s:not(.lit)").forEach(w => {
      const on = w.classList.contains("keep") || onPageSecs.has(secOf(+w.dataset.a).n);
      w.classList.toggle("near", on);
      w.classList.toggle("plain", !on);
    });
  }
  // Learn: sections on the page in view and the one you're on stay bright; the rest fade.
  function paintStrip() {
    const learnTab = mode === "learn" ? ltab : null;
    document.querySelectorAll("#strip .blk").forEach((b, i) => {
      const k = i + 1;
      b.setAttribute("aria-pressed", mode !== "quiz" && k === sel ? "true" : "false");
      b.classList.toggle("faded", !!learnTab && k !== sel && !onPageSecs.has(k));
      let c = 0;
      for (let a = S[i].a; a <= S[i].b; a++) if (weak(a)) c++;
      const w = b.querySelector(".weak");
      w.hidden = !c; w.textContent = c ? `${c} weak` : "";
    });
  }
  // A bar under the pages: one pip per page (right to left, like the pages), the one in view filled.
  function paintPagebar() {
    const pages = D.pages.map(pg => pg.p), i = pages.indexOf(viewPage);
    $("pagepips").querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.p === viewPage));
    $("pagetxt").textContent = pages.length > 1
      ? `Page ${viewPage} · ${i + 1} of ${pages.length} in this surah · swipe the page for the others`
      : `Page ${viewPage} · the whole surah is on this page`;
  }
  let syncAt = 0, syncTimer = 0;
  $("pages").addEventListener("scroll", () => {
    clearTimeout(syncTimer);
    if (Date.now() - syncAt > 120) { syncAt = Date.now(); syncStrip(); }
    syncTimer = setTimeout(syncStrip, 120);   // and once more when the swipe settles
  }, { passive: true });

  /* ---------- build once per surah ---------- */
  function buildPages() {
    const el = $("pages");
    el.innerHTML = "";
    D.pages.forEach(pg => {
      const page = document.createElement("div");
      page.className = "page"; page.id = "p" + pg.p;
      const byN = {};
      pg.lines.forEach(l => (byN[l.n] = l));
      // surah title / basmala lines, placed at build time (a surah that starts at the top of a page
      // has its title on the last line of the previous page)
      const special = {};
      (pg.specials || []).forEach(x => (special[x.n] = { k: x.k, h: { ar: x.ar } }));
      for (let ln = 1; ln <= 15; ln++) {
        const row = document.createElement("div");
        row.className = "ln";
        if (byN[ln]) {
          byN[ln].w.forEach(([t, s, a, end]) => {
            const k = `${s}:${a}`, sp = document.createElement("span");
            if (s === n) {
              sp.className = `w s s${secOf(a).color}`;
              sp.dataset.a = a;
              // a tap on the page follows the open tab: the Ayah tab jumps to that ayah, the Section tab to its section
              sp.addEventListener("click", () => { if (mode === "learn") openAyah(a, true, ltab === "section" ? "section" : "ayah"); });
            } else sp.className = "w o";
            const rec = (AY[k] = AY[k] || { words: [], start: [pg.p, ln], els: [] });
            rec.end = [pg.p, ln];
            rec.els.push(sp);
            if (end) { const e = document.createElement("span"); e.className = "e"; e.textContent = t; sp.appendChild(e); }
            else { sp.textContent = t; rec.words.push(t); }
            row.appendChild(sp);
          });
        } else if (special[ln]) {
          row.classList.add("center");
          const sp = document.createElement("span");
          if (special[ln].k === "name") { sp.className = "name"; sp.textContent = "سورة " + special[ln].h.ar; }
          else sp.textContent = IDX.basmala;
          row.appendChild(sp);
        }
        page.appendChild(row);
      }
      const no = document.createElement("div");
      no.className = "pno"; no.textContent = pg.p;
      page.appendChild(no);
      el.appendChild(page);
    });
    S.forEach(s => {
      s.words = 0;
      for (let a = s.a; a <= s.b; a++) s.words += AY[key(a)]?.words.length || 1;
      s.from = AY[key(s.a)].start; s.to = AY[key(s.b)].end;
      s.marker = text(key(s.a)).includes("۞");
    });
    const pips = $("pagepips");
    pips.innerHTML = D.pages.map(pg => `<button type="button" data-p="${pg.p}" aria-label="Page ${pg.p}" title="Page ${pg.p}"></button>`).join("");
    pips.querySelectorAll("button").forEach(b => (b.onclick = () => centerIn($("pages"), $("p" + b.dataset.p))));
  }

  function buildHeader() {
    $("sTitle").innerHTML = `${esc(nameOf(n))} <span class="ar" lang="ar">${esc(meta.ar)}</span>`;
    $("sub").textContent = `${meta.place === "makkah" ? "Makkan" : "Madinan"} · ${N} ${N > 1 ? "ayat" : "ayah"} · ${S.length} section${S.length > 1 ? "s" : ""} · ${C.sub}`;
    $("theme").textContent = C.theme;
    $("whyBody").innerHTML = C.story.map(p => `<p>${esc(p)}</p>`).join("");
    const [p0, p1] = meta.pages;
    $("qbar").innerHTML = `<i style="right:${((p0 - 1) / 604 * 100).toFixed(2)}%;width:${((p1 - p0 + 1) / 604 * 100).toFixed(2)}%"></i>`;
    $("posTxt").textContent = `Juz ${meta.juz[0]} · Hizb ${meta.hizb[0]} · ${p0 === p1 ? `page ${p0}` : `pages ${p0}–${p1}`}`;
    const link = m => {
      if (!IDX.surahs[m]) return "";
      return IDX.ready.includes(m) ? `<a href="#${m}">${esc(nameOf(m))} (${m})</a>` : `${esc(nameOf(m))} (${m})`;
    };
    $("neigh").innerHTML = `<span>${n < 114 ? `← ${link(n + 1)}` : ""}</span><span class="me">${esc(nameOf(n))} (${n})</span><span class="r">${n > 1 ? `${link(n - 1)} →` : ""}</span>`;
    // a surah can start in a juz the app doesn't cover (Fussilat starts in Juz 24), so use the first one it has
    const jn = range(meta.juz[0], meta.juz[1]).find(j => IDX.juz[j]?.surahs.includes(n)) ?? meta.juz[0];
    const J = IDX.juz[jn];
    $("jLbl").textContent = `Surahs of Juz ${jn}, in order`;
    $("jRange").textContent = `Pages ${J.pages[0]}–${J.pages[1]} · reads right to left`;
    $("jline").innerHTML = J.surahs.map((m, k) => {
      const x = IDX.surahs[m];
      const nextStart = k + 1 < J.surahs.length ? IDX.surahs[J.surahs[k + 1]].pages[0] : J.pages[1] + 1;
      const tag = IDX.ready.includes(m) && m !== n ? "a" : "div";
      return `<${tag} class="js${m === n ? " me" : ""}"${tag === "a" ? ` href="#${m}"` : ""} style="flex:${Math.max(1, nextStart - x.pages[0])} 1 0"${m === n ? ' aria-current="page"' : ""}>
        <span class="jn">${m}</span><span class="jar" lang="ar">${esc(x.ar)}</span><span class="jen">${esc(nameOf(m))}</span>
        <span class="jpg">p.${x.pages[0]}${x.pages[1] !== x.pages[0] ? "–" + x.pages[1] : ""}</span></${tag}>`;
    }).join("");
  }

  function buildStrip() {
    const strip = $("strip");
    strip.innerHTML = "";
    S.forEach(s => {
      const b = document.createElement("button");
      b.type = "button"; b.className = `blk b${s.color}`; b.id = "blk" + s.n;
      b.innerHTML = `<b>${s.n}</b><em>${esc(s.title)}</em><span>${ayatLabel(s.a, s.b)}</span><i class="weak" hidden></i>`;
      b.setAttribute("aria-label", `Section ${s.n}: ${s.title}, ${ayatLabel(s.a, s.b)}`);
      b.addEventListener("click", () => (mode === "quiz" ? answer(s.n) : choose(s.n, true)));
      strip.appendChild(b);
    });
  }

  function mount(num, data) {
    n = num; D = data; C = data.content; meta = data.meta; N = meta.ayat;
    S = C.sections.map((s, i) => ({ ...s, n: i + 1, color: (i % 8) + 1 }));
    REP = {};
    (data.repeats || []).forEach(g => g.ayat.forEach(a => (REP[a] = g)));
    AY = {};
    mode = "learn"; sel = 1; cur = 1; revealed = 0; viewPage = 0;
    ltab = "ayah";   // every surah opens on the Ayah tab with its rows closed
    drill = null; drillNote = ""; allClear = false;
    quizA = 0; lastQuiz = 0; answered = false; score[0] = score[1] = 0;
    stuckThisPass.clear(); openGroups.clear();
    buildPages(); buildHeader(); buildStrip();
    $("f-quiz").hidden = S.length < 2;
    $("stage").scrollTop = 0;   // phones: back to the first screen
    simSel = 0;
    $("f-sim").hidden = !(data.similars || []).length;
    syncFeat();
    render();
    requestAnimationFrame(() => {
      centerIn($("jline").parentElement, $("jline").querySelector(".me"));
      $("pages").scrollBy({ left: 0 });
      syncStrip(true);
    });
  }

  /* ---------- per-render ---------- */
  function paint() {
    const st = $("stage"), s = S[sel - 1];
    st.classList.toggle("test", mode === "test");
    st.classList.toggle("quiz", mode === "quiz");
    st.classList.toggle("sim", mode === "sim");
    const G = D.similars || [];
    const SIMK = new Set(mode === "sim" && G[simSel] ? G[simSel].members.filter(m => surahOfKey(m.k) === n).map(m => +m.k.split(":")[1]) : []);
    $("surah").classList.toggle("surah-test", mode === "test");
    // What Learn lights up on the pages, solid: Ayah tab = the ayah (underlined too); Section tab = the whole
    // section; Weak spots = the weak ayat, or the current step of a drill. Around that, the sections on the page
    // in view show their colours lightly (matching the section list), so a swipe through the pages reads as a map.
    const learnTab = mode === "learn" ? ltab : null, wk = new Set(learnTab === "weak" ? weakList() : []);
    const steps = new Set(drill && learnTab === "weak" ? drill.steps : []);
    const veilA = drill && learnTab === "weak" && !drill.done && drill.idx <= drill.steps.indexOf(drill.a) ? drill.a : 0;
    document.querySelectorAll("#pages .w.s").forEach(w => {
      const a = +w.dataset.a, inSel = a >= s.a && a <= s.b;
      let lit = inSel, isCur = false, keep = false;
      if (learnTab === "ayah") { lit = a === cur; isCur = lit; }
      else if (learnTab === "weak") {
        if (drill) { lit = a === cur; isCur = lit; keep = steps.has(a) && !lit; }
        else lit = wk.has(a);
      }
      const near = !!learnTab && !lit && (keep || onPageSecs.has(secOf(a).n));
      w.classList.toggle("dim", mode === "test" && !inSel);
      w.classList.toggle("lit", !!learnTab && lit);
      w.classList.toggle("keep", keep);
      w.classList.toggle("plain", !!learnTab && !lit && !near);
      w.classList.toggle("near", near);
      w.classList.toggle("curayah", isCur);
      w.classList.toggle("veil", a === veilA);
      w.classList.toggle("sel", mode === "test" && inSel);
      w.classList.toggle("shown", mode === "test" && inSel && a < s.a + revealed);
      w.classList.toggle("stuck", weak(a) > 0);
      w.classList.toggle("rep", !!REP[a]);
      w.classList.toggle("simfocus", SIMK.has(a));
      w.classList.remove("focus");
    });
    // Test me: the next ayah's first word only shows after "I'm stuck"
    if (mode === "test" && revealed < s.b - s.a + 1 && stuckThisPass.has(s.a + revealed)) AY[key(s.a + revealed)].els[0].classList.add("shown");
    const fk = mode === "quiz" && answered ? key(quizA) : null;
    if (fk) AY[fk].els.forEach(w => w.classList.add("focus"));
    paintStrip();
  }

  function neighbourCard(dir, s) {
    const other = S[s.n - 1 + (dir === "prev" ? -1 : 1)];
    const k = dir === "prev" ? prevKey(s.a) : nextKey(s.b);
    if (!k) return "";
    const lbl = dir === "prev" ? "Before this section" : "After this section";
    const tail = `<span class="mid-ar" lang="ar">${text(k)}</span><span class="d">“${esc(meaning(k))}”</span>`;
    if (other) {
      return `<button type="button" class="nbc" data-go="${other.n}" style="border-inline-start:4px solid var(--s${other.color}e)">
        <span class="d">${lbl} · ayah ${k}</span><span class="t">Section ${other.n}: ${esc(other.title)}</span>
        <span class="d">${esc(firstSentence(other.meaning))}</span>${tail}</button>`;
    }
    const m = surahOfKey(k), info = IDX.surahs[m] || {}, sec = dir === "prev" ? info.lastSection : info.firstSection;
    const inner = `<span class="d">${lbl} · ayah ${k}</span>
      <span class="t">${dir === "prev" ? "End" : "Start"} of ${esc(nameOf(m))} (${m})</span>
      ${sec ? `<span class="d">${esc(sec.title)}: ${esc(firstSentence(sec.meaning))}</span>` : ""}${tail}`;
    return IDX.ready.includes(m)
      ? `<a class="nbc" href="#${m}" style="border-inline-start:4px solid var(--line)">${inner}</a>`
      : `<div class="nbc" style="border-inline-start:4px solid var(--line);cursor:default">${inner}</div>`;
  }

  const ordinal = i => i + (["th", "st", "nd", "rd"][(i % 100 > 10 && i % 100 < 14) ? 0 : (i % 10 < 4 ? i % 10 : 0)]);
  const repLinks = (ayat, skip) => ayat.filter(x => x !== skip).map(x => `<button type="button" class="replink" data-a="${x}">${x}</button>`).join(" · ");
  function repInfo(a) {
    const g = REP[a];
    if (!g) return "";
    return g.exact
      ? `<div class="repbox"><b>Repeated ${g.ayat.length}× in this surah</b><span>This is the ${ordinal(g.ayat.indexOf(a) + 1)} time. Also at ayah ${repLinks(g.ayat, a)}</span></div>`
      : `<div class="repbox"><b>Nearly the same as ayah ${g.ayat.filter(x => x !== a).join(", ")}</b><span>Only the start differs, so watch the first word. Compare: ayah ${repLinks(g.ayat, a)}</span></div>`;
  }
  function weakRow(s) {
    const list = range(s.a, s.b).filter(a => weak(a));
    return list.length ? `<div class="weakrow"><span class="lbl red">Weak spots</span>${list.map(a => `<button type="button" class="pill-red" data-weak="${a}">Ayah ${a} · ${weak(a)}×</button>`).join("")}</div>` : "";
  }
  const spanTxt = s => (s.from[0] === s.to[0] ? `p.${s.from[0]} · lines ${s.from[1]}–${s.to[1]}` : `p.${s.from[0]} line ${s.from[1]} → p.${s.to[0]} line ${s.to[1]}`);

  /* ---------- Learn · Section tab: the section before, this one in full, the one after ---------- */
  function sectionBlock(s) {
    const cnt = s.b - s.a + 1;
    const sajdah = (meta.sajdah || []).filter(x => { const a = +x.verse_key.split(":")[1]; return a >= s.a && a <= s.b; });
    // The essentials stay visible; everything else folds away until tapped.
    const fold = (id, title, hint, body) => `<details class="fold" data-f="${id}"${openFolds.has(id) ? " open" : ""}>
      <summary>${title}<span class="d">${hint}</span></summary><div class="foldbody">${body}</div></details>`;
    return `
      <div class="lbl">Section ${s.n} of ${S.length} · ${ayatLabel(s.a, s.b)}</div>
      <div class="strio">
        ${neighbourCard("prev", s)}
        <div class="here secmain" style="border-inline-start-width:5px;border-inline-start-color:var(--s${s.color}e)">
          <span class="k">This section · ${ayatLabel(s.a, s.b)}</span>
          <h2 class="ptitle">${esc(s.title)}</h2>
          <p class="meaning">${esc(s.meaning)}</p>
          <div class="facts"><span class="fact">${spanTxt(s)}</span><span class="fact">${cnt} ${cnt > 1 ? "ayat" : "ayah"}</span>${s.marker ? `<span class="fact key">Starts at the ۞ mark</span>` : ""}${sajdah.map(x => `<span class="fact key">Sajdah at ayah ${x.verse_key.split(":")[1]}</span>`).join("")}</div>
          <div class="folds one">
            ${fold("deeper", "Go deeper", "why it matters, the story, lessons", `
              <div class="dblock"><h3>Why it matters</h3><p>${esc(s.matters)}</p></div>
              <div class="dblock"><h3>The story behind it</h3><p>${esc(s.story)}</p></div>
              <div class="dblock"><h3>The meaning, explained</h3>${(s.explained || []).map(p => `<p>${esc(p)}</p>`).join("")}</div>
              <div class="dblock"><h3>What it teaches us</h3><ul>${(s.teaches || []).map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`)}
          </div>
          ${weakRow(s)}
          <div class="hook"><span class="lbl">Memory hook</span><p>${esc(s.hook)}</p></div>
          <div class="kp"><span class="lbl">Key points · ${(s.points || []).length} · open one for its ayat</span>${pointDetails(s)}</div>
          <div class="row"><button class="btn" type="button" id="b-test">Test this section</button></div>
        </div>
        ${neighbourCard("next", s)}
      </div>
      <div class="src">Translation: Sahih International · Explanations condensed from classical tafsir: Ibn Kathīr, al-Saʿdī, al-Jalālayn, al-Baghawī, al-Qurṭubī and Maʿāriful Qurʾān.</div>`;
  }

  function ctx(label, k, big, extra = "") {
    if (!k) return "";
    const m = surahOfKey(k), other = m !== n ? ` (${esc(nameOf(m))})` : "";
    const stuck = big && m === n && weak(+k.split(":")[1]);
    return `<div class="ctx ${big ? "cur" : "dim"}${stuck ? " is-stuck" : ""}${extra}"><span class="k">${label} · ${k}${other}</span>
      <div class="${big ? "big-ar" : "mid-ar"}" lang="ar">${text(k)}</div>
      <div class="tr"${big ? ' style="color:var(--ink)"' : ""}>“${esc(meaning(k))}”</div></div>`;
  }
  // The ayah before / after are buttons that step, the same as the bar at the bottom.
  const stepCard = (label, k, dir) => (k ? `<button type="button" class="ctxbtn" data-step="${dir}">${ctx(label, k, false)}</button>` : "");

  /* ---------- Learn · Ayah tab ---------- */
  function ayahBlock() {
    const s = secOf(cur), k = key(cur), x = C.ayat[cur], g = groupOf(cur);
    return `
      <div class="lbl">Ayah ${cur} of ${N} · section ${s.n} · ${pos(k)}</div>
      <div class="trio">
        ${stepCard("Ayah before", prevKey(cur), -1)}
        ${ctx("This ayah", k, true)}
        ${stepCard("Ayah after", nextKey(cur), 1)}
      </div>
      ${repInfo(cur)}
      ${x ? `<div class="ctx gx"><span class="k">Ayah ${cur} in depth</span><p>${esc(x.explain)}</p>${whyBox(x)}</div>` : ""}
      ${g && g.a !== g.b ? `<div class="ctx gx"><span class="k">What ayat ${g.a}–${g.b} mean</span><p>${esc(g.text)}</p></div>` : ""}`;
  }

  /* ---------- Learn · Weak spots tab: list, memory aids and the practice drill ---------- */
  // A memory aid built from what the app already knows about the ayah: what leads into it, what it means,
  // what follows, its first word, and any look-alikes to watch for.
  function memoryAid(a) {
    const x = C.ayat[a] || {}, g = groupOf(a), s = secOf(a), pk = prevKey(a), nk = nextKey(a);
    const items = [];
    if (pk) items.push(["It comes right after", `“${esc(meaning(pk))}”`]);
    items.push(["It means", `“${esc(meaning(key(a)))}”`]);
    if (x.explain) items.push(["The point of it", esc(x.explain)]);
    if (g && g.a !== g.b) items.push([`Ayat ${g.a}–${g.b} together`, esc(g.text)]);
    if (nk) items.push(["Then comes", `“${esc(meaning(nk))}”`]);
    items.push(["It starts with", `<span class="mid-ar" lang="ar">${AY[key(a)].words[0]}</span>`]);
    if (REP[a]) items.push(["Watch out", REP[a].exact
      ? `This ayah comes ${REP[a].ayat.length}× in this surah (ayat ${REP[a].ayat.join(", ")}). Know which time you're on, and what follows each.`
      : `Nearly the same as ayah ${REP[a].ayat.filter(y => y !== a).join(", ")}. Only the first word differs.`]);
    const simCue = (D.similars || []).flatMap(gr => gr.members).find(m => m.k === key(a) && m.cue);
    if (simCue) items.push(["Look-alike elsewhere", esc(simCue.cue)]);
    if (s.hook) items.push(["The section's hook", esc(s.hook)]);
    if (x.why) items.push(["Why it was revealed", esc(x.why)]);
    return `<div class="aid"><h3>How to remember ayah ${a}</h3><dl>${items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl></div>`;
  }
  function startDrill(a, note = "") {
    const steps = [a - 2, a - 1, a, a + 1].filter(x => x >= 1 && x <= N);
    drill = { a, steps, idx: 0, done: false };
    drillNote = note;
    cur = steps[0]; sel = secOf(cur).n;
    render();
    scrollToPage(AY[key(cur)].start[0]);
  }
  function drillStep(dir) {
    if (!drill) return;
    drillNote = "";
    const i = drill.idx + dir;
    if (i < 0) { drill = null; render(); return; }
    if (i >= drill.steps.length) { drill.done = true; cur = drill.a; }
    else { drill.idx = i; drill.done = false; cur = drill.steps[i]; }
    sel = secOf(cur).n;
    render();
    scrollToPage(AY[key(cur)].start[0]);
  }
  function drillAnswer(ok) {
    if (!drill) return;
    const a = drill.a, k = key(a);
    if (!ok) {
      streaks[k] = 0; store.set("juzapp-streak-v1", streaks);
      return startDrill(a, `Not this time. Start again from ayah ${drill.steps[0]}: the count is back to 0 of ${PASSES}.`);
    }
    const st = (streaks[k] || 0) + 1;
    if (st < PASSES) {
      streaks[k] = st; store.set("juzapp-streak-v1", streaks);
      return startDrill(a, `Good: ${st} of ${PASSES} in a row. Once more from ayah ${drill.steps[0]}.`);
    }
    delete streaks[k]; store.set("juzapp-streak-v1", streaks);
    Weak.clear(n, a);   // passed five times in a row: the weak spot clears itself
    const rest = weakList(), next = rest.find(x => x > a) || rest[0];
    if (next) return startDrill(next, `Ayah ${a} cleared. On to ayah ${next}.`);
    drill = null; allClear = true; render();
  }
  function skipSpot() {
    const list = weakList(), next = list.find(x => x > drill.a) || list[0];
    if (next && next !== drill.a) startDrill(next, `Skipped ayah ${drill.a}. Now ayah ${next}.`);
  }
  function weakBlock() {
    const list = weakList(), K = list.length;
    if (!drill) {
      if (!K) return `
        <div class="lbl">Weak spots</div>
        <h2 class="ptitle">${allClear ? "All clear" : "No weak spots yet"}</h2>
        <p class="tr">${allClear ? "You passed every weak spot in this surah. Now go back to the start and recite the whole surah."
          : "Mark an ayah with the bar at the bottom of the Ayah tab, or tap “I’m stuck” in Test me, and it shows up here."}</p>
        ${allClear ? `<div class="row"><button class="btn" type="button" id="b-recite">Recite the whole surah</button></div>` : ""}`;
      return `
        <div class="lbl red">Weak spots · ${K} in this surah</div>
        <h2 class="ptitle">Practise each one until it sticks</h2>
        <p class="tr">Each spot is drilled in context: read the two ayat before it, recite it, read the one after, then say how it went. Get it right ${PASSES} times in a row and it clears itself.</p>
        <div class="wlist">${list.map(a => `<button type="button" class="wrow" data-drill="${a}">
          <span class="wn">Ayah ${a}</span><span class="wc">stuck ${weak(a)}× · ${streakOf(a)} of ${PASSES} passed</span>
          <span class="mid-ar" lang="ar">${text(key(a))}</span><span class="tr">“${esc(meaning(key(a)))}”</span></button>`).join("")}</div>
        <div class="row"><button class="btn" type="button" data-drill="${list[0]}">Start practising</button><button class="btn clearbtn" type="button" id="b-clearall"></button></div>`;
    }
    const { a, steps, idx, done } = drill, aIdx = steps.indexOf(a), st = streakOf(a), spot = list.indexOf(a) + 1;
    const cards = steps.map((x, i) => {
      const k = key(x), veiled = x === a && !done && idx <= aIdx, big = !done && i === idx;
      if (veiled) return `<div class="ctx ${big ? "cur" : "dim"} veiled"><span class="k">Ayah ${x} · recite it from memory</span>
        <div class="big-ar" lang="ar"><span class="veilbox">${AY[k].words.map(() => "▬").join(" ")}</span></div>
        <button type="button" class="replink" id="b-peek">Show the first word</button></div>`;
      return ctx(x === a ? "The weak spot" : i < aIdx ? `Ayah ${x} · read it` : "Ayah after", k, big || (done && x === a));
    });
    return `
      <div class="lbl red">Practising · weak spot ${spot} of ${K} · ayah ${a}</div>
      ${drillNote ? `<div class="note">${esc(drillNote)}</div>` : ""}
      <div class="streak"><b>${st} of ${PASSES}</b> in a row${st ? "" : " · your first pass"}</div>
      ${done ? `<h2 class="ptitle">Did you recite ayah ${a} correctly?</h2><p class="tr">Answer with the bar at the bottom.</p>` : ""}
      <div class="trio">${cards.join("")}</div>
      ${memoryAid(a)}
      <div class="row"><button type="button" class="replink" id="b-skip"${K > 1 ? "" : " hidden"}>Skip to the next weak spot</button><button type="button" class="replink" id="b-stop">Stop practising</button></div>`;
  }


  /* ---------- Learn: tabs, the panel and the bar ---------- */
  function renderLearn() {
    const s = S[sel - 1], P = $("panel"), K = weakList().length;
    const tab = (id, label) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${ltab === id}">${label}</button>`;
    const body = ltab === "section" ? sectionBlock(s) : ltab === "weak" ? weakBlock() : ayahBlock();
    P.innerHTML = `<div class="ltabs" role="tablist" aria-label="Show">${tab("ayah", `Ayah ${cur}`)}${tab("section", `Section ${s.n}`)}${tab("weak", `Weak spots${K ? ` <i>${K}</i>` : ""}`)}</div>
      <div class="lbody">${body}</div>`;
    P.querySelectorAll("[data-tab]").forEach(b => (b.onclick = () => setTab(b.dataset.tab)));
    P.querySelectorAll("details.fold").forEach(d => d.addEventListener("toggle", () => {
      if (d.open) openFolds.add(d.dataset.f); else openFolds.delete(d.dataset.f);
      store.set("juzapp-folds", [...openFolds]);
    }));
    P.querySelectorAll("details.grpd").forEach(d => d.addEventListener("toggle", () => (d.open ? openGroups.add(d.dataset.k) : openGroups.delete(d.dataset.k))));
    P.querySelectorAll(".ayd-go, .replink[data-a]").forEach(b => (b.onclick = () => openAyah(+b.dataset.a, true, "ayah")));
    P.querySelectorAll("[data-weak]").forEach(b => (b.onclick = () => openAyah(+b.dataset.weak, true, "ayah")));
    P.querySelectorAll("[data-go]").forEach(b => (b.onclick = () => openAyah(S[+b.dataset.go - 1].a, true, "section")));
    P.querySelectorAll("[data-step]").forEach(b => (b.onclick = () => stepLearn(+b.dataset.step)));
    P.querySelectorAll("[data-drill]").forEach(b => (b.onclick = () => startDrill(+b.dataset.drill)));
    if ($("b-test")) $("b-test").onclick = () => setMode("test");
    if ($("b-recite")) $("b-recite").onclick = () => { sel = 1; allClear = false; setMode("test"); };
    if ($("b-clearall")) armClear($("b-clearall"), `Clear all ${K} weak spot${K > 1 ? "s" : ""} in this surah`, () => Weak.clearSurah(n));
    if ($("b-skip")) $("b-skip").onclick = skipSpot;
    if ($("b-stop")) $("b-stop").onclick = () => { drill = null; drillNote = ""; render(); };
    if ($("b-peek")) $("b-peek").onclick = () => { $("b-peek").outerHTML = `<div class="big-ar" lang="ar">${AY[key(drill.a)].words[0]} …</div>`; };
    paintBar();
  }
  function paintBar() {
    const K = weakList().length, prev = $("a-prev"), next = $("a-next"), mk = $("a-mark"), num = $("a-num"), view = $("a-view");
    prev.className = "btn ghost"; next.className = "btn"; prev.disabled = next.disabled = false;
    mk.hidden = ltab !== "ayah";
    view.hidden = ltab === "weak" || !K;
    view.textContent = `View ${K} weak spot${K > 1 ? "s" : ""}`;
    const surahBtn = (dir) => { const b = dir < 0 ? prev : next; b.textContent = dir < 0 ? "‹ Previous surah" : "Next surah ›"; b.disabled = !IDX.ready.includes(n + dir); };
    if (ltab === "weak") {
      if (!drill) {
        surahBtn(-1);
        num.textContent = K ? `${K} weak spot${K > 1 ? "s" : ""}` : allClear ? "All clear" : "No weak spots";
        if (K) next.textContent = "Start practising ›";
        else if (allClear) next.textContent = "Recite the whole surah ›";
        else surahBtn(1);
        return;
      }
      const { steps, idx, done, a } = drill;
      num.textContent = done ? `Ayah ${a} · ${streakOf(a)} of ${PASSES}` : `Ayah ${cur} · step ${idx + 1} of ${steps.length}`;
      if (done) { prev.textContent = "I made a mistake"; prev.className = "btn stuckbtn"; next.textContent = "No mistake ✓"; next.className = "btn okbtn"; }
      else { prev.textContent = idx === 0 ? "Stop" : "‹ Back"; next.textContent = idx === steps.length - 1 ? "How did it go? ›" : "Next ›"; }
      return;
    }
    const bySection = ltab === "section", unit = bySection ? "section" : "ayah";
    const atStart = bySection ? sel <= 1 : cur <= 1, atEnd = bySection ? sel >= S.length : cur >= N;
    if (atStart) surahBtn(-1); else prev.textContent = `‹ Previous ${unit}`;
    if (atEnd) surahBtn(1); else next.textContent = `Next ${unit} ›`;
    num.textContent = bySection ? `Section ${sel} of ${S.length}` : `Ayah ${cur} of ${N}`;
    const c = weak(cur);
    mk.textContent = c ? `Marked ${c}× · undo` : "Mark weak spot";
    mk.classList.toggle("on", !!c);
  }
  function setTab(t) {
    if (!TABS.includes(t)) return;
    if (mode !== "learn") { mode = "learn"; revealed = 0; stuckThisPass.clear(); syncFeat(); }
    if (t !== "weak") { drill = null; drillNote = ""; }
    if (t !== ltab) { ltab = t; store.set("juzapp-ltab", ltab); }
    render();
  }

  /* ---------- Test me ---------- */
  function renderTest() {
    const s = S[sel - 1], total = s.b - s.a + 1, last = s.a + revealed - 1, next = s.a + revealed;
    const marked = stuckThisPass.has(next);
    const tag = a => (weak(a) ? ` · stuck ${weak(a)}×` : "");
    $("panel").innerHTML = `
      <div class="lbl">Test · section ${s.n} · ${ayatLabel(s.a, s.b)}</div>
      <h2 class="ptitle">${esc(s.title)}</h2>
      <p>Recite each ayah from memory, then tap “Reveal next ayah” in the bar at the bottom to check yourself. Stuck? Tap “I’m stuck” to see the ayah’s first word; that ayah is marked red as a weak spot.</p>
      ${revealed ? `<div class="ctx cur${weak(last) ? " is-stuck" : ""}"><span class="k">Ayah ${last}${revealed >= total ? " · end of the section" : ""}${tag(last)}</span>
        <div class="big-ar" lang="ar">${text(key(last))} <span class="e">${toAr(last)}</span></div>
        <div class="tr">“${esc(meaning(key(last)))}”</div></div>` : ""}
      ${revealed < total ? (marked
        ? `<div class="ctx dim"><span class="k">Ayah ${next} starts with${tag(next)}</span>
        <div class="big-ar red" lang="ar">${AY[key(next)].words[0]} …</div></div>`
        : `<div class="ctx dim"><span class="k">Next: ayah ${next}${tag(next)}</span><p class="tr">Recite it from memory.</p></div>`) : ""}
      ${revealed > 1 ? `<div class="ayat"><span class="lbl">Revealed so far</span>${range(s.a, last - 1).map(a => `<div class="mid-ar${weak(a) ? " red" : ""}" lang="ar">${text(key(a))} <span class="e">${toAr(a)}</span></div>`).join("")}</div>` : ""}`;
    // One set of controls, in the bar pinned to the bottom of the screen.
    const dock = $("dock");
    dock.hidden = false;
    dock.innerHTML = `<button class="btn" type="button" data-act="rev" ${revealed >= total ? "disabled" : ""}>${revealed ? "Reveal next ayah" : `Reveal ayah ${s.a}`}</button>
      <button class="btn stuckbtn" type="button" data-act="stuck" ${revealed >= total || marked ? "disabled" : ""}>${marked ? "First word shown" : "I’m stuck · show first word"}</button>
      <button class="btn ghost" type="button" data-act="hide" ${revealed ? "" : "disabled"}>Hide again</button>
      <span class="big">${revealed}/${total}</span>`;
    dock.querySelectorAll("[data-act]").forEach(b => (b.onclick = () => act(b.dataset.act, s, total, next)));
  }
  function act(what, s, total, next) {
    if (what === "rev") { revealed = Math.min(total, revealed + 1); render(); scrollToPage(AY[key(s.a + revealed - 1)].start[0]); }
    if (what === "stuck") { stuckThisPass.add(next); Weak.mark(n, next); scrollToPage(AY[key(next)].start[0]); }
    if (what === "hide") { revealed = 0; stuckThisPass.clear(); render(); }
  }

  /* ---------- Similars: look-alike ayat here and elsewhere, in muṣḥaf order ---------- */
  const simName = (s, m) => (IDX.surahs[s] ? nameOf(s) : (m.name || `Surah ${s}`).replace(/'/g, "ʿ"));
  function simLabel(g) {
    const total = g.members.length + (g.more || 0);
    return `${total} places · ${g.kind === "within" ? "in this surah" : g.kind === "cross" ? "in other surahs" : "here and in other surahs"}`;
  }
  const markDiff = (t, diff) => (!diff || !diff.length ? t : t.split(" ").map((w, i) => (diff.includes(i) ? `<mark class="simdiff">${w}</mark>` : w)).join(" "));
  function simOcc(m, j) {
    const s = surahOfKey(m.k), here = s === n, a = +m.k.split(":")[1];
    const link = here ? `<button type="button" class="replink" data-go-ayah="${a}">open in Learn</button>`
      : IDX.ready.includes(s) ? `<a class="replink" href="#${s}">open surah</a>` : "";
    const side = (lbl, r) => (r ? `<div class="simctx"><span class="k">${lbl} · ${r.k}</span><div class="mid-ar" lang="ar">${r.text}</div><div class="tr">“${esc(r.tr)}”</div></div>` : "");
    return `<li class="simcard${here ? " here" : ""}">
      <div class="simhead"><b>${j + 1}. ${here ? "This surah" : `${esc(simName(s, m))} (${s})`} · ayah ${a}</b><span class="d">p.${m.page} · ${m.exact ? "same words" : "words differ"}</span>${link}</div>
      ${m.cue ? `<p class="simcue">${esc(m.cue)}</p>` : ""}
      ${side("Before", m.before)}
      <div class="simmain"><span class="k">The ayah · ${m.k}</span><div class="big-ar" lang="ar">${markDiff(m.text, m.diff)}</div><div class="tr" style="color:var(--ink)">“${esc(m.tr)}”</div></div>
      ${side("After", m.after)}
    </li>`;
  }
  function renderSim() {
    const G = D.similars || [], P = $("panel");
    P.innerHTML = `
      <div class="lbl">Similars · ${G.length} group${G.length > 1 ? "s" : ""}</div>
      <h2 class="ptitle">Look-alike ayat</h2>
      <p class="tr">Ayat that repeat or nearly repeat, here and elsewhere in the Quran. Pick one to see every place it appears, in order, with the ayah before and after.</p>
      <div class="simlist">${G.map((g, i) => {
        const m = g.members.find(x => surahOfKey(x.k) === n) || g.members[0];
        return `<button type="button" class="simbtn${i === simSel ? " on" : ""}" data-i="${i}"><span class="mid-ar" lang="ar">${m.text}</span><span class="d">Ayah ${m.k.split(":")[1]} · ${simLabel(g)}</span></button>`;
      }).join("")}</div>`;
    P.querySelectorAll(".simbtn").forEach(b => (b.onclick = () => {
      simSel = +b.dataset.i;
      render();
      const mine = G[simSel].members.find(x => surahOfKey(x.k) === n);
      if (mine && AY[mine.k]) scrollToPage(AY[mine.k].start[0]);
      // on phones the details sit below the list, so bring them into view
      if (window.innerWidth < 1100) $("deep").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    const el = $("deep"), g = G[simSel];
    if (!g) { el.hidden = true; return; }
    el.hidden = false;
    el.style.borderTopColor = "var(--rep)";
    el.innerHTML = `
      <div class="lbl rep">Similars · group ${simSel + 1} of ${G.length}</div>
      <h2 class="dtitle">${esc(simLabel(g))}</h2>
      ${g.flow ? `<div class="dblock hook"><h3>How to remember the order</h3><p>${esc(g.flow)}</p></div>` : ""}
      <ol class="simocc">${g.members.map(simOcc).join("")}</ol>
      ${g.more ? `<p class="src">${g.more} more similar ayat elsewhere in the Quran aren’t shown.</p>` : ""}`;
    el.querySelectorAll("[data-go-ayah]").forEach(b => (b.onclick = () => { setMode("learn"); openAyah(+b.dataset.goAyah, true, "ayah"); }));
  }

  /* ---------- Quiz ---------- */
  function renderQuiz() {
    const k = key(quizA), s = secOf(quizA);
    $("panel").innerHTML = `
      <div class="lbl">Quiz · ${score[0]} of ${score[1]} right</div>
      <p>Which section is this ayah in? Tap it in the section list.</p>
      <div class="big-ar" lang="ar">${text(k)}</div>
      ${answered ? `<div class="result ${lastOk ? "ok" : "no"}">${lastOk ? "Right" : "Not quite"}: section ${s.n}, ayah ${quizA}, ${pos(k)}</div>
        <div class="tr">“${esc(meaning(k))}”</div><div><b>${esc(s.title)}</b></div>` : ""}
      <div class="row"><button class="btn${answered ? "" : " ghost"}" type="button" id="b-q">Another ayah</button></div>`;
    $("b-q").onclick = newQuiz;
  }
  function newQuiz() {
    document.querySelectorAll("#strip .blk").forEach(b => b.classList.remove("right", "wrong"));
    let a;
    do { a = 1 + Math.floor(Math.random() * N); } while (a === lastQuiz && N > 1);
    quizA = lastQuiz = a; answered = false;
    render();
  }
  function answer(sn) {
    if (!quizA || answered) return;
    const s = secOf(quizA);
    lastOk = s.n === sn; answered = true; score[1]++; if (lastOk) score[0]++;
    $("blk" + s.n).classList.add("right");
    if (!lastOk) $("blk" + sn).classList.add("wrong");
    render();
    scrollToPage(AY[key(quizA)].start[0]);
  }

  // Key points, each opening into its ayat. A point's range ("5–6") maps onto the ayat it covers.
  function pointDetails(s) {
    const parse = r => {
      const m = String(r).replace(/[–—]/g, "-").match(/^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/);
      if (!m) return null;
      const a = +m[1], b = +(m[2] || m[1]);
      return a >= s.a && b <= s.b && a <= b ? [a, b] : null;
    };
    return (s.points || []).map(([r, t]) => {
      const ab = parse(r);
      return ab ? groupDetails({ a: ab[0], b: ab[1], text: t }) : `<div class="grpd plainpt"><b>${esc(r)}</b><p>${esc(t)}</p></div>`;
    }).join("");
  }
  function groupDetails(g) {
    const gk = `${g.a}-${g.b}`, open = openGroups.has(gk);   // rows stay closed until tapped
    const ayat = range(g.a, g.b).map(a => {
      const x = C.ayat[a] || {};
      return `<div class="ayd${cur === a ? " cur" : ""}${weak(a) ? " is-stuck" : ""}">
        <button type="button" class="ayd-go" data-a="${a}">Ayah ${a} · show on page</button>
        ${weak(a) ? `<span class="stuckpill">Stuck ${weak(a)}×</span>` : ""}
        ${REP[a] ? `<span class="reppill">${REP[a].exact ? `Repeated ${REP[a].ayat.length}× in this surah` : `Nearly the same as ayah ${REP[a].ayat.filter(x => x !== a).join(", ")}`}</span>` : ""}
        <div class="mid-ar" lang="ar">${text(key(a))} <span class="e">${toAr(a)}</span></div>
        <div class="tr">“${esc(meaning(key(a)))}”</div>
        ${x.explain ? `<p>${esc(x.explain)}</p>` : ""}${whyBox(x)}</div>`;
    }).join("");
    return `<details class="grpd" data-k="${gk}"${open ? " open" : ""}>
      <summary><b>${g.a === g.b ? g.a : `${g.a}–${g.b}`}</b><p>${esc(g.text)}</p><span class="more"></span></summary>
      <div class="ayds">${ayat}</div></details>`;
  }
  // Learn keeps everything in the panel, so the area under the pages is only used by Similars.
  function renderDeep() { $("deep").hidden = true; }

  // Phones: the surah view is a scroller of three screens. A re-render can change the height of what is
  // above the reader (e.g. the panel), so remember where they are within their screen and put it back.
  function screenAnchor() {
    const st = $("stage");
    if (!st || st.scrollHeight <= st.clientHeight + 1) return () => {};
    const ids = ["scr1", "scr2", "scr3"], y = st.scrollTop, tops = ids.map(id => $(id).offsetTop - st.offsetTop);
    let i = 0;
    tops.forEach((t, k) => { if (t <= y + 1) i = k; });
    const d = y - tops[i];
    return () => { const t2 = $(ids[i]).offsetTop - st.offsetTop; if (Math.abs(st.scrollTop - (t2 + d)) > 1) st.scrollTop = t2 + d; };
  }
  function render() {
    if (!D) return;
    const restore = screenAnchor();
    renderNow();
    restore();
  }
  function renderNow() {
    if (weakList().length) allClear = false;
    // Only the chosen feature shows. Learn opens with the surah's intro card; the others go straight to the pages.
    $("sHead").hidden = $("scr1").hidden = mode !== "learn";
    $("strip").hidden = mode === "sim";
    paint();
    syncStrip(true);
    renderDeep();
    $("dock").hidden = mode !== "test";
    $("anav").hidden = mode !== "learn";
    $("surah").classList.toggle("surah-nav", mode === "learn");
    $("hint").innerHTML = (mode === "learn" ? "Tap any word to jump to that ayah, or step with the bar at the bottom" : mode === "test" ? "Pick a section, then recite it" : mode === "sim" ? "Look-alike ayat: pick one to see every place it appears" : "Find the ayah’s section")
      + (Object.keys(REP).length ? ' · <span class="replegend">violet underline = repeated ayah</span>' : "");
    if (mode === "learn") renderLearn();
    else if (mode === "test") renderTest();
    else if (mode === "sim") renderSim();
    else if (mode === "quiz") renderQuiz();
  }
  const FEAT = { learn: "Learn", test: "Test me", quiz: "Quiz", sim: "Similars" };
  function syncFeat() {
    $("featName").textContent = FEAT[mode];
    document.querySelectorAll("#featMenu button").forEach(b => b.setAttribute("aria-current", b.dataset.mode === mode ? "true" : "false"));
  }
  function choose(sn, scroll) {
    if (mode === "learn") return openAyah(S[sn - 1].a, scroll, "section");   // show the section, sitting on its first ayah
    sel = sn; revealed = 0; stuckThisPass.clear();
    render();
    revealY($("strip"), $("blk" + sn));
    if (scroll) scrollToPage(S[sn - 1].from[0]);
  }
  function openAyah(a, scroll, tab) {
    if (tab && tab !== ltab) { ltab = tab; store.set("juzapp-ltab", ltab); }
    if (ltab !== "weak") { drill = null; drillNote = ""; }
    cur = a; sel = secOf(a).n;
    render();
    const P = $("panel");
    if (P.scrollHeight > P.clientHeight) P.scrollTop = 0;   // wide screens: keep the current ayah in sight
    revealY($("strip"), $("blk" + sel));
    if (scroll) scrollToPage(AY[key(a)].start[0]);
  }
  function setMode(m) {
    if (!D) return;
    if (m === "quiz" && S.length < 2) m = "learn";
    if (m === "sim" && !(D.similars || []).length) m = "learn";
    mode = m; revealed = 0; stuckThisPass.clear();
    drill = null; drillNote = "";
    syncFeat();
    document.querySelectorAll("#strip .blk").forEach(b => b.classList.remove("right", "wrong"));
    if (m === "quiz") newQuiz(); else render();
  }
  function leave() {
    $("dock").hidden = true;
    $("anav").hidden = true;
    $("surah").classList.remove("surah-test", "surah-nav");
    drill = null; drillNote = "";
  }
  // Arrow keys step through Learn, matching the bar: ← previous, → next.
  document.addEventListener("keydown", e => {
    if (!D || $("surah").hidden || mode !== "learn" || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (drill && drill.done) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stepLearn(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); stepLearn(-1); }
  });

  return { get n() { return n; }, mount, setMode, setTab, refresh: render, leave };
})();

/* Wire up the shell once everything is defined. */
// Feature menu (▾ in the top bar): pick Learn, Test me, Quiz, Similars or About for the open surah.
const featBtn = $("featBtn"), featMenu = $("featMenu");
const closeFeat = () => { featMenu.hidden = true; featBtn.setAttribute("aria-expanded", "false"); };
featBtn.addEventListener("click", () => {
  const opening = featMenu.hidden;
  featMenu.hidden = !opening;
  featBtn.setAttribute("aria-expanded", String(opening));
  if (opening) featMenu.querySelector('[aria-current="true"]')?.focus();
});
featMenu.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
  closeFeat();
  Surah.setMode(b.dataset.mode);
  window.scrollTo({ top: 0, behavior: "smooth" });
}));
document.addEventListener("click", e => { if (!featMenu.hidden && !e.target.closest("#feat")) closeFeat(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !featMenu.hidden) { closeFeat(); featBtn.focus(); } });
Weak.listeners.add(() => {
  if (!$("home").hidden) showHome();
  else if (Surah.n) Surah.refresh();
});
// The opening animation plays once per launch; a tap skips it.
const splash = $("splash");
if (splash && !splash.hidden) {
  if ($("splashBism") && !$("splashBism").textContent) $("splashBism").textContent = IDX.basmala;   // from the muṣḥaf data, not typed by hand
  // Mark it played as soon as it starts, so a reload mid-animation (e.g. when an update takes over) doesn't replay it.
  try { sessionStorage.setItem("qf-splash", "1"); } catch (e) { /* storage unavailable */ }
  const done = () => { splash.hidden = true; };
  if (reduceMotion) done(); else { splash.addEventListener("click", done); setTimeout(done, 3800); }
}
window.addEventListener("hashchange", route);
Weak.connect();
route();
