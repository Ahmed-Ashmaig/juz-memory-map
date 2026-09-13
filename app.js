"use strict";
/* Juz 28–30 Memory Map — app shell: routing, home screen, weak-spot store, surah loading. */
const IDX = window.JUZAPP_INDEX;
const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toAr = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
const pad = n => String(n).padStart(3, "0");
const nameOf = n => (IDX.surahs[n]?.name || `Surah ${n}`).replace(/'/g, "ʿ");
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

/* ---------- home ---------- */
function chip(n, last) {
  const s = IDX.surahs[n], ready = IDX.ready.includes(n), w = Weak.total(n);
  return `<a class="chip${ready ? "" : " pending"}${n === last ? " last" : ""}" href="#${n}"${ready ? "" : ' aria-disabled="true" tabindex="-1"'}>
    <span class="jn">${n}</span><span class="jar" lang="ar">${esc(s.ar)}</span>
    <span class="jen">${esc(nameOf(n))}</span><span class="jpg">${s.ayat} ayat · p.${s.pages[0]}</span>
    <span class="weak">${w ? `${w} weak spot${w > 1 ? "s" : ""}` : ready ? "" : "coming soon"}</span></a>`;
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
  $("crumb").innerHTML = ""; $("navbtns").innerHTML = "";
  Surah.leave();
  const last = store.get("juzapp-last", null);
  $("resume").innerHTML = last && IDX.ready.includes(last)
    ? `<div class="row" style="margin-top:.4rem"><a class="btn" href="#${last}">Continue with ${esc(nameOf(last))}</a></div>` : "";
  const allWeak = Object.keys(Weak.local).reduce((sum, k) => sum + Weak.total(k), 0);
  $("clearAllWrap").innerHTML = allWeak ? `<button type="button" class="btn clearbtn" id="clearAll"></button>` : "";
  if (allWeak) armClear($("clearAll"), `Clear all weak spots (${allWeak})`, () => Weak.clearAll());
  $("juzList").innerHTML = [30, 29, 28].map(j => {
    const J = IDX.juz[j];
    return `<div class="juzblock"><h2>Juz ${j}<span class="src">pages ${J.pages[0]}–${J.pages[1]} · ${J.surahs.length} surahs</span></h2>
      <div class="chips">${J.surahs.map(n => chip(n, last)).join("")}</div></div>`;
  }).join("");
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
async function openSurah(n) {
  const token = ++routeToken;
  $("home").hidden = true; $("surah").hidden = false;
  if (Surah.n !== n) {
    $("surahBody").hidden = true; $("loading").hidden = false; $("loading").textContent = "Loading…";
    window.scrollTo(0, 0);
  }
  let data;
  try { data = await loadSurah(n); }
  catch (e) { if (token === routeToken) $("loading").textContent = "This surah couldn’t load. Check your connection, then reload the page."; return; }
  if (token !== routeToken) return;
  store.set("juzapp-last", n);
  const s = IDX.surahs[n];
  $("crumb").innerHTML = `<b>${n}. ${esc(nameOf(n))}</b> · Juz ${s.juz[0]}`;
  const later = IDX.ready.includes(n + 1) ? `<a href="#${n + 1}" aria-label="Next surah">‹ ${n + 1}</a>` : "";
  const earlier = IDX.ready.includes(n - 1) ? `<a href="#${n - 1}" aria-label="Previous surah">${n - 1} ›</a>` : "";
  $("navbtns").innerHTML = later + earlier;
  if (Surah.n !== n) {
    try { Surah.mount(n, data); }
    catch (e) { $("loading").textContent = "This surah couldn’t open. Please try another one."; console.error(e); return; }
  }
  $("loading").hidden = true; $("surahBody").hidden = false;
}
function route() {
  const m = location.hash.match(/^#(\d{1,3})$/);
  const n = m ? Number(m[1]) : null;
  if (n && IDX.ready.includes(n)) openSurah(n); else showHome();
}

/* Surah view: muṣḥaf pages, section strip, Learn / Test me / Quiz, Go deeper. */
const Surah = (() => {
  let n = null, D = null, C = null, meta = null, N = 0, S = [], AY = {};
  let mode = "learn", sel = 1, view = "section", cur = null, revealed = 0, showAll = false;
  let quizA = 0, lastQuiz = 0, answered = false, lastOk = false;
  let REP = {};   // ayah -> repeat group from data (ayat repeated within this surah)
  const score = [0, 0];
  const stuckThisPass = new Set();
  const openGroups = new Set();

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
  const ayatLabel = (a, b) => (a === b ? `ayah ${a}` : `ayat ${a}–${b}`);
  const firstSentence = t => { const m = String(t || "").match(/^.*?[.!?](\s|$)/); return m ? m[0].trim() : String(t || ""); };
  const whyBox = x => (x && x.why ? `<div class="whyr"><b>Why it was revealed</b><p>${esc(x.why)}</p></div>` : "");

  function centerIn(container, el) {
    if (!container || !el || container.scrollWidth <= container.clientWidth + 4) return;
    const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    container.scrollBy({ left: r.left + r.width / 2 - (c.left + c.width / 2), behavior: "smooth" });
  }
  const scrollToPage = p => centerIn($("pages"), $("p" + p));

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
              sp.addEventListener("click", () => { if (mode === "learn") openAyah(a, true); });
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
    const J = IDX.juz[meta.juz[0]];
    $("jLbl").textContent = `Surahs of Juz ${meta.juz[0]}, in order`;
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
    strip.style.gridTemplateColumns = S.map(s => `minmax(2.4rem, ${s.words}fr)`).join(" ");
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
    mode = "learn"; sel = 1; view = "section"; cur = null; revealed = 0; showAll = false;
    quizA = 0; lastQuiz = 0; answered = false; score[0] = score[1] = 0;
    stuckThisPass.clear(); openGroups.clear();
    buildPages(); buildHeader(); buildStrip();
    $("m-quiz").hidden = S.length < 2;
    document.querySelectorAll(".modes button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === "learn" ? "true" : "false"));
    render();
    requestAnimationFrame(() => {
      centerIn($("jline").parentElement, $("jline").querySelector(".me"));
      $("pages").scrollBy({ left: 0 });
    });
  }

  /* ---------- per-render ---------- */
  function paint() {
    const st = $("stage"), s = S[sel - 1];
    st.classList.toggle("test", mode === "test");
    st.classList.toggle("quiz", mode === "quiz");
    $("surah").classList.toggle("surah-test", mode === "test");
    document.querySelectorAll("#pages .w.s").forEach(w => {
      const a = +w.dataset.a, inSel = a >= s.a && a <= s.b;
      w.classList.toggle("dim", mode !== "quiz" && !inSel);
      w.classList.toggle("sel", mode === "test" && inSel);
      w.classList.toggle("shown", mode === "test" && inSel && a < s.a + revealed);
      w.classList.toggle("stuck", weak(a) > 0);
      w.classList.toggle("rep", !!REP[a]);
      w.classList.remove("focus");
    });
    if (mode === "test") {
      AY[key(s.a)].els[0].classList.add("shown");
      if (revealed < s.b - s.a + 1) AY[key(s.a + revealed)].els[0].classList.add("shown");
    }
    const fk = mode === "learn" && view === "ayah" ? key(cur) : mode === "quiz" && answered ? key(quizA) : null;
    if (fk) AY[fk].els.forEach(w => w.classList.add("focus"));
    document.querySelectorAll("#strip .blk").forEach((b, i) => {
      b.setAttribute("aria-pressed", mode !== "quiz" && i + 1 === sel ? "true" : "false");
      let c = 0;
      for (let a = S[i].a; a <= S[i].b; a++) if (weak(a)) c++;
      const w = b.querySelector(".weak");
      w.hidden = !c; w.textContent = c ? `${c} weak` : "";
    });
    const total = Weak.total(n), cb = $("clearWeak");
    cb.hidden = !total;
    if (total) armClear(cb, `Clear red marks (${total})`, () => Weak.clearSurah(n));
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
  function repRow(s) {
    const gs = Object.values(REP).filter((g, i, all) => all.indexOf(g) === i && g.ayat.some(a => a >= s.a && a <= s.b));
    if (!gs.length) return "";
    return `<div class="reprow"><span class="lbl rep">Repeated ayat</span>${gs.map(g => `<div class="repitem">
      <span class="mid-ar" lang="ar">${text(key(g.ayat[0]))}</span>
      <span class="d">${g.exact ? `${g.ayat.length}× exactly` : "nearly the same (first word differs)"} · ayat ${repLinks(g.ayat)}</span></div>`).join("")}</div>`;
  }
  function weakRow(s) {
    const list = range(s.a, s.b).filter(a => weak(a));
    return list.length ? `<div class="weakrow"><span class="lbl red">Weak spots</span>${list.map(a => `<button type="button" class="pill-red" data-weak="${a}">Ayah ${a} · ${weak(a)}×</button>`).join("")}</div>` : "";
  }
  const spanTxt = s => (s.from[0] === s.to[0] ? `p.${s.from[0]} · lines ${s.from[1]}–${s.to[1]}` : `p.${s.from[0]} line ${s.from[1]} → p.${s.to[0]} line ${s.to[1]}`);

  function renderSection() {
    const s = S[sel - 1], cnt = s.b - s.a + 1;
    const sajdah = (meta.sajdah || []).filter(x => { const a = +x.verse_key.split(":")[1]; return a >= s.a && a <= s.b; });
    const P = $("panel");
    P.innerHTML = `
      <div class="lbl">Section ${s.n} of ${S.length} · ${ayatLabel(s.a, s.b)}</div>
      <h2 class="ptitle">${esc(s.title)}</h2>
      <p class="meaning">${esc(s.meaning)}</p>
      <div class="facts"><span class="fact">${spanTxt(s)}</span><span class="fact">${cnt} ${cnt > 1 ? "ayat" : "ayah"}</span>${s.marker ? `<span class="fact key">Starts at the ۞ mark</span>` : ""}${sajdah.map(x => `<span class="fact key">Sajdah at ayah ${x.verse_key.split(":")[1]}</span>`).join("")}</div>
      ${weakRow(s)}
      ${repRow(s)}
      <ul class="points">${(s.points || []).map(([r, t]) => `<li><b>${esc(r)}</b><span>${esc(t)}</span></li>`).join("")}</ul>
      <div class="lbl">Opens with</div>
      <div><div class="big-ar" lang="ar">${text(key(s.a))}</div><div class="tr">“${esc(meaning(key(s.a)))}”</div></div>
      <div class="lbl">Around it</div>
      <div class="nb">${neighbourCard("prev", s)}${neighbourCard("next", s)}</div>
      <div class="row">
        <button class="btn" type="button" id="b-all">${showAll ? "Hide the ayat" : "Every ayah with its meaning"}</button>
        <button class="btn ghost" type="button" id="b-test">Test this section</button>
      </div>
      ${showAll ? `<div class="ayat">${range(s.a, s.b).map(a => `<button type="button" class="ay${weak(a) ? " is-stuck" : ""}" data-a="${a}"><span class="mid-ar" lang="ar">${text(key(a))} <span class="e">${toAr(a)}</span></span><span class="t">${a}. ${esc(meaning(key(a)))}</span></button>`).join("")}</div>` : ""}
      <div class="src">Translation: Sahih International</div>`;
    P.querySelectorAll("[data-go]").forEach(b => (b.onclick = () => choose(+b.dataset.go, true)));
    P.querySelectorAll(".ay").forEach(b => (b.onclick = () => openAyah(+b.dataset.a, true)));
    P.querySelectorAll("[data-weak]").forEach(b => (b.onclick = () => openAyah(+b.dataset.weak, true)));
    P.querySelectorAll(".replink").forEach(b => (b.onclick = () => openAyah(+b.dataset.a, true)));
    $("b-all").onclick = () => { showAll = !showAll; render(); };
    $("b-test").onclick = () => setMode("test");
  }

  function ctx(label, k, big) {
    if (!k) return "";
    const m = surahOfKey(k), other = m !== n ? ` (${esc(nameOf(m))})` : "";
    const stuck = big && m === n && weak(+k.split(":")[1]);
    return `<div class="ctx ${big ? "cur" : "dim"}${stuck ? " is-stuck" : ""}"><span class="k">${label} · ${k}${other}</span>
      <div class="${big ? "big-ar" : "mid-ar"}" lang="ar">${text(k)}</div>
      <div class="tr"${big ? ' style="color:var(--ink)"' : ""}>“${esc(meaning(k))}”</div></div>`;
  }

  function renderAyah() {
    const s = secOf(cur), k = key(cur), x = C.ayat[cur], g = groupOf(cur), c = weak(cur);
    const P = $("panel");
    P.innerHTML = `
      <div class="navrow">
        <button class="btn ghost" type="button" id="b-next" ${cur === N ? "disabled" : ""}>‹ Next</button>
        <button class="btn ghost" type="button" id="b-prev" ${cur === 1 ? "disabled" : ""}>Previous ›</button>
        <button class="btn" type="button" id="b-back">Back to section ${s.n}</button>
      </div>
      <div class="lbl">Ayah ${cur} · section ${s.n} · ${pos(k)}</div>
      <h2 class="ptitle" style="font-size:1.15rem">${esc(s.title)}</h2>
      ${ctx("Ayah before", prevKey(cur), false)}
      ${ctx("This ayah", k, true)}
      ${repInfo(cur)}
      ${c ? `<div class="stuckbox"><b>You got stuck here ${c}×</b><button class="btn ghost" type="button" id="b-clear">Clear red mark</button></div>`
          : `<div class="row"><button class="btn ghost" type="button" id="b-mark">Mark as a weak spot</button></div>`}
      ${x ? `<div class="ctx gx"><span class="k">Ayah ${cur} in depth</span><p>${esc(x.explain)}</p>${whyBox(x)}</div>` : ""}
      ${g && g.a !== g.b ? `<div class="ctx gx"><span class="k">What ayat ${g.a}–${g.b} mean</span><p>${esc(g.text)}</p></div>` : ""}
      ${ctx("Ayah after", nextKey(cur), false)}`;
    $("b-prev").onclick = () => openAyah(cur - 1, true);
    $("b-next").onclick = () => openAyah(cur + 1, true);
    $("b-back").onclick = () => { view = "section"; render(); };
    P.querySelectorAll(".replink").forEach(b => (b.onclick = () => openAyah(+b.dataset.a, true)));
    if ($("b-clear")) $("b-clear").onclick = () => Weak.clear(n, cur);
    if ($("b-mark")) $("b-mark").onclick = () => Weak.mark(n, cur);
  }

  function renderTest() {
    const s = S[sel - 1], total = s.b - s.a + 1, last = s.a + revealed - 1, next = s.a + revealed;
    const marked = stuckThisPass.has(next);
    const tag = a => (weak(a) ? ` · stuck ${weak(a)}×` : "");
    const controls = `<button class="btn" type="button" data-act="rev" ${revealed >= total ? "disabled" : ""}>${revealed ? "Reveal next ayah" : `Reveal ayah ${s.a}`}</button>
      <button class="btn stuckbtn" type="button" data-act="stuck" ${revealed >= total || marked ? "disabled" : ""}>${marked ? `Ayah ${next} marked` : "I’m stuck"}</button>`;
    $("panel").innerHTML = `
      <div class="lbl">Test · section ${s.n} · ${ayatLabel(s.a, s.b)}</div>
      <h2 class="ptitle">${esc(s.title)}</h2>
      <p>Recite out loud and reveal each ayah to check yourself. The next ayah’s first word is your cue. If you get stuck, tap “I’m stuck” to mark that ayah red.</p>
      <div class="row" style="align-items:center">${controls}
        <button class="btn ghost" type="button" data-act="hide">Hide again</button>
        <span class="big" style="margin-inline-start:auto">${revealed} / ${total}</span>
      </div>
      ${revealed ? `<div class="ctx cur${weak(last) ? " is-stuck" : ""}"><span class="k">Ayah ${last}${revealed >= total ? " · end of the section" : ""}${tag(last)}</span>
        <div class="big-ar" lang="ar">${text(key(last))} <span class="e">${toAr(last)}</span></div>
        <div class="tr">“${esc(meaning(key(last)))}”</div></div>` : ""}
      ${revealed < total ? `<div class="ctx dim"><span class="k">Ayah ${next} starts with${tag(next)}</span>
        <div class="big-ar${weak(next) ? " red" : ""}" lang="ar">${AY[key(next)].words[0]} …</div></div>` : ""}
      ${revealed > 1 ? `<div class="ayat"><span class="lbl">Revealed so far</span>${range(s.a, last - 1).map(a => `<div class="mid-ar${weak(a) ? " red" : ""}" lang="ar">${text(key(a))} <span class="e">${toAr(a)}</span></div>`).join("")}</div>` : ""}`;
    const dock = $("dock");
    dock.hidden = false;
    dock.innerHTML = `${controls}<span class="big">${revealed}/${total}</span>`;
    [$("panel"), dock].forEach(root => root.querySelectorAll("[data-act]").forEach(b => (b.onclick = () => act(b.dataset.act, s, total, next))));
  }
  function act(what, s, total, next) {
    if (what === "rev") { revealed = Math.min(total, revealed + 1); render(); scrollToPage(AY[key(s.a + revealed - 1)].start[0]); }
    if (what === "stuck") { stuckThisPass.add(next); Weak.mark(n, next); }
    if (what === "hide") { revealed = 0; stuckThisPass.clear(); render(); }
  }

  function renderQuiz() {
    const k = key(quizA), s = secOf(quizA);
    $("panel").innerHTML = `
      <div class="lbl">Quiz · ${score[0]} of ${score[1]} right</div>
      <p>Which section is this ayah in? Tap it in the strip.</p>
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

  function groupDetails(g) {
    const gk = `${g.a}-${g.b}`;
    const ayat = range(g.a, g.b).map(a => {
      const x = C.ayat[a] || {};
      return `<div class="ayd${view === "ayah" && cur === a ? " cur" : ""}${weak(a) ? " is-stuck" : ""}">
        <button type="button" class="ayd-go" data-a="${a}">Ayah ${a} · show on page</button>
        ${weak(a) ? `<span class="stuckpill">Stuck ${weak(a)}×</span>` : ""}
        ${REP[a] ? `<span class="reppill">${REP[a].exact ? `Repeated ${REP[a].ayat.length}× in this surah` : `Nearly the same as ayah ${REP[a].ayat.filter(x => x !== a).join(", ")}`}</span>` : ""}
        <div class="mid-ar" lang="ar">${text(key(a))} <span class="e">${toAr(a)}</span></div>
        <div class="tr">“${esc(meaning(key(a)))}”</div>
        ${x.explain ? `<p>${esc(x.explain)}</p>` : ""}${whyBox(x)}</div>`;
    }).join("");
    return `<details class="grpd" data-k="${gk}"${openGroups.has(gk) ? " open" : ""}>
      <summary><b>${g.a === g.b ? g.a : `${g.a}–${g.b}`}</b><p>${esc(g.text)}</p><span class="more"></span></summary>
      <div class="ayds">${ayat}</div></details>`;
  }
  function renderDeep() {
    const el = $("deep");
    if (mode !== "learn") { el.hidden = true; return; }
    const s = S[sel - 1];
    el.hidden = false;
    el.style.borderTopColor = `var(--s${s.color}e)`;
    el.innerHTML = `
      <div class="lbl">Go deeper · section ${s.n} · ${ayatLabel(s.a, s.b)}</div>
      <h2 class="dtitle">${esc(s.title)}</h2>
      <div class="dgrid">
        <div class="dblock"><h3>Why it matters</h3><p>${esc(s.matters)}</p></div>
        <div class="dblock"><h3>The story behind it</h3><p>${esc(s.story)}</p></div>
      </div>
      <div class="dblock"><h3>The meaning, explained</h3>${(s.explained || []).map(p => `<p>${esc(p)}</p>`).join("")}</div>
      <div class="dgrid">
        <div class="dblock"><h3>What it teaches us</h3><ul>${(s.teaches || []).map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>
        <div class="dblock hook"><h3>Memory hook</h3><p>${esc(s.hook)}</p></div>
      </div>
      <div class="dblock"><h3>Ayah by ayah</h3>${C.groups.filter(g => g.a >= s.a && g.b <= s.b).map(groupDetails).join("")}</div>
      <div class="src">Condensed from classical tafsir: Ibn Kathīr, al-Saʿdī, al-Jalālayn, al-Baghawī, al-Qurṭubī and Maʿāriful Qurʾān.</div>`;
    el.querySelectorAll("details.grpd").forEach(d => d.addEventListener("toggle", () => (d.open ? openGroups.add(d.dataset.k) : openGroups.delete(d.dataset.k))));
    el.querySelectorAll(".ayd-go").forEach(b => (b.onclick = () => openAyah(+b.dataset.a, true)));
  }

  function render() {
    if (!D) return;
    paint();
    renderDeep();
    $("dock").hidden = mode !== "test";
    $("hint").innerHTML = (mode === "learn" ? "Tap a section, or any word on the page" : mode === "test" ? "Pick a section, then recite it" : "Find the ayah’s section")
      + (mode === "learn" && Object.keys(REP).length ? ' · <span class="replegend">violet underline = repeated ayah</span>' : "");
    if (mode === "learn") (view === "ayah" ? renderAyah() : renderSection());
    else if (mode === "test") renderTest();
    else renderQuiz();
  }
  function choose(sn, scroll) {
    sel = sn; view = "section"; revealed = 0; showAll = false; stuckThisPass.clear();
    render();
    centerIn($("strip"), $("blk" + sn));
    if (scroll) scrollToPage(S[sn - 1].from[0]);
  }
  function openAyah(a, scroll) {
    cur = a; sel = secOf(a).n; view = "ayah";
    const g = groupOf(a);
    if (g) openGroups.add(`${g.a}-${g.b}`);
    render();
    centerIn($("strip"), $("blk" + sel));
    if (scroll) scrollToPage(AY[key(a)].start[0]);
  }
  function setMode(m) {
    if (!D) return;
    if (m === "quiz" && S.length < 2) m = "learn";
    mode = m; view = "section"; revealed = 0; showAll = false; stuckThisPass.clear();
    document.querySelectorAll(".modes button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === m ? "true" : "false"));
    document.querySelectorAll("#strip .blk").forEach(b => b.classList.remove("right", "wrong"));
    if (m === "quiz") newQuiz(); else render();
  }
  function leave() {
    $("dock").hidden = true;
    $("surah").classList.remove("surah-test");
  }
  // Arrow keys step through ayat in the ayah view, following the muṣḥaf: ← next, → previous.
  document.addEventListener("keydown", e => {
    if (!D || $("surah").hidden || mode !== "learn" || view !== "ayah" || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft" && cur < N) { e.preventDefault(); openAyah(cur + 1, true); }
    if (e.key === "ArrowRight" && cur > 1) { e.preventDefault(); openAyah(cur - 1, true); }
  });

  return { get n() { return n; }, mount, setMode, refresh: render, leave };
})();

/* Wire up the shell once everything is defined. */
document.querySelectorAll(".modes button").forEach(b => b.addEventListener("click", () => Surah.setMode(b.dataset.mode)));
Weak.listeners.add(() => {
  if (!$("home").hidden) showHome();
  else if (Surah.n) Surah.refresh();
});
window.addEventListener("hashchange", route);
Weak.connect();
route();
