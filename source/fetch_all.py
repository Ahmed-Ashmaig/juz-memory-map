"""Fetch everything the Juz 28–30 memory app needs from quran-mcp, into raw/.

Per surah: metadata + rukus, Sahih International translation, English and Arabic
tafsir, passage groupings, quran.com chapter info, and a readable brief.md for the
content writers. Mushaf pages are cached once in raw/pages/. Safe to re-run: finished
surahs are skipped.
"""
import html
import json
import os
import re
import sys
import time
import urllib.request

SP = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(SP, "raw")
os.makedirs(os.path.join(RAW, "pages"), exist_ok=True)
U = "https://mcp.quran.ai"
HDR = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


class MCP:
    def __init__(self):
        self.sid, self.id, self.nonce = None, 0, None
        self.init()

    def _post(self, body, notify=False):
        h = dict(HDR)
        if self.sid:
            h["mcp-session-id"] = self.sid
        req = urllib.request.Request(U, data=json.dumps(body).encode(), headers=h, method="POST")
        with urllib.request.urlopen(req, timeout=240) as r:
            self.sid = r.headers.get("mcp-session-id") or self.sid
            raw = r.read().decode()
        if notify:
            return None
        datas = [l[5:].strip() for l in raw.splitlines() if l.startswith("data:")]
        return json.loads(datas[-1] if datas else raw)

    def init(self):
        self.sid = None
        self._post({"jsonrpc": "2.0", "id": 0, "method": "initialize",
                    "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                               "clientInfo": {"name": "juz-memory-app", "version": "1"}}})
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"}, notify=True)
        g = self._call("fetch_grounding_rules", {})
        m = re.search(r"gnd-[0-9a-f]{16}", json.dumps(g))
        self.nonce = m.group(0) if m else None

    def _call(self, name, args):
        self.id += 1
        msg = self._post({"jsonrpc": "2.0", "id": self.id, "method": "tools/call",
                          "params": {"name": name, "arguments": args}})
        r = msg.get("result", msg)
        if r.get("isError"):
            raise RuntimeError(f"{name} {args}: {json.dumps(r)[:300]}")
        return r

    def tool(self, name, args):
        if self.nonce and name in ("fetch_quran", "fetch_translation", "fetch_tafsir", "fetch_mushaf"):
            args = {**args, "grounding_nonce": self.nonce}
        for attempt in range(6):
            try:
                r = self._call(name, args)
                time.sleep(0.15)
                return r.get("structuredContent") or {}
            except Exception as e:  # network hiccup or expired session
                log("retry", name, str(e)[:160])
                time.sleep(3 * (attempt + 1))
                if attempt >= 1:
                    try:
                        self.init()
                    except Exception as e2:
                        log("reinit failed", str(e2)[:160])
        raise RuntimeError(f"gave up on {name} {args}")

    def fetch_all(self, name, args):
        out, s, i = {}, self.tool(name, args), 0
        while True:
            for ed, rows in (s.get("results") or {}).items():
                out.setdefault(ed, []).extend(rows)
            tok = (s.get("pagination") or {}).get("continuation")
            i += 1
            if not tok:
                return out
            if i > 600:   # long surahs (Al-Baqarah) need many pages; stop only if something is clearly looping
                log("WARNING: stopped paging", name, "after", i, "pages; results may be incomplete")
                return out
            s = self.tool(name, {"continuation": tok})


def strip_html(t, drop_arabic_divs=False):
    if drop_arabic_divs:
        t = re.sub(r'<div class="arabic[^"]*">.*?</div>', " ", t, flags=re.S)
    t = re.sub(r"<h[1-4][^>]*>(.*?)</h[1-4]>", r"\n### \1\n", t, flags=re.S)
    t = re.sub(r"</p>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", t)).strip()


def clean_tr(t):
    return re.sub(r"\s+", " ", re.sub(r"<sup[^>]*>.*?</sup>", "", t)).strip()


def rng(key_a, key_b):
    return f"{key_a.split(':')[1]}–{key_b.split(':')[1]}"


mcp = MCP()
page_cache = {}


def get_page(p):
    f = os.path.join(RAW, "pages", f"p{p:03d}.json")
    if os.path.exists(f):
        return json.load(open(f))
    s = mcp.tool("fetch_mushaf", {"page": p})
    vk = {v["verse_id"]: v["verse_key"] for v in s["verses"]}
    data = {
        "p": p,
        "lines": [{"n": ln["line_number"],
                   "w": [[w["text"], *map(int, vk[w["verse_id"]].split(":")), 1 if w["char_type_name"] == "end" else 0]
                         for w in ln["words"]]} for ln in s["lines"]],
        "headers": [{"id": h["chapter_id"], "ar": h["name_arabic"], "en": h["name_simple"],
                     "before": h["appears_before_line"], "bism": h["bismillah_pre"]} for h in s["surah_headers"]],
    }
    json.dump(data, open(f, "w"), ensure_ascii=False)
    return data


def edge_words(key):
    s, a = map(int, key.split(":"))
    m = mcp.tool("fetch_quran_metadata", {"surah": s, "ayah": a})
    p = m["page"]["number"]
    pg = get_page(p)
    return p, " ".join(w[0] for ln in pg["lines"] for w in ln["w"] if w[1] == s and w[2] == a and not w[3])


def chapter_info(n):
    try:
        req = urllib.request.Request(f"https://api.quran.com/api/v4/chapters/{n}/info?language=en",
                                     headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"})
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.loads(r.read().decode())["chapter_info"]
        return {"source": d.get("source"), "text": strip_html(d.get("text", ""))}
    except Exception as e:
        log("chapter info failed", n, e)
        return {"source": None, "text": ""}


def do_surah(n):
    d = os.path.join(RAW, f"s{n:03d}")
    if os.path.exists(os.path.join(d, "done")):
        return
    os.makedirs(d, exist_ok=True)
    log("surah", n)
    meta = mcp.tool("fetch_quran_metadata", {"surah": n})
    si = meta["surah"][0]
    N = meta["ayah"]["count"]
    rukus = []
    for r in range(meta["ruku"]["start"], meta["ruku"]["end"] + 1):
        m = mcp.tool("fetch_quran_metadata", {"ruku": r})
        a, b = m["ayah"]["start_verse_key"], m["ayah"]["end_verse_key"]
        if a.split(":")[0] == str(n):
            rukus.append([int(a.split(":")[1]), int(b.split(":")[1])])
    prev_key = next_key = None
    if n > 1:
        pm = mcp.tool("fetch_quran_metadata", {"surah": n - 1})
        prev_key = f"{n - 1}:{pm['ayah']['count']}"
    if n < 114:
        next_key = f"{n + 1}:1"
    for p in range(meta["page"]["start"], meta["page"]["end"] + 1):
        get_page(p)
    edges = {}
    for k in (prev_key, next_key):
        if k:
            p, words = edge_words(k)
            edges[k] = {"page": p, "text": words}
    tr = mcp.fetch_all("fetch_translation", {"ayahs": f"{n}:1-{N}", "editions": "en-sahih-international"})
    trmap = {e["ayah"].split(":")[1]: clean_tr(e["text"]) for e in tr.get("en-sahih-international", [])}
    if edges:
        et = mcp.fetch_all("fetch_translation", {"ayahs": list(edges), "editions": "en-sahih-international"})
        for e in et.get("en-sahih-international", []):
            edges[e["ayah"]]["tr"] = clean_tr(e["text"])
    ayahs = f"{n}:1-{N}"
    en = mcp.fetch_all("fetch_tafsir", {"ayahs": ayahs, "editions": ["en-ibn-kathir", "en-maarif-ul-quran", "en-tazkirul-quran"]})
    ar = mcp.fetch_all("fetch_tafsir", {"ayahs": ayahs, "editions": ["ar-saadi", "ar-jalalayn", "ar-baghawi"]})
    grp = mcp.fetch_all("fetch_tafsir", {"ayahs": ayahs, "editions": ["ar-kashaf", "ar-tahrir-wa-tanwir"]})
    qur = mcp.fetch_all("fetch_tafsir", {"ayahs": ayahs, "editions": ["ar-qurtubi"]})
    info = chapter_info(n)

    def passages(rows):
        seen, out = set(), []
        for r in rows:
            p = r.get("passage_ayah_range") or r["range"]
            if p not in seen:
                seen.add(p)
                out.append(p.split(":", 1)[1] if ":" in p else p)
        return out

    groupings = {ed: passages(rows) for ed, rows in {**en, **grp}.items()}
    meta_out = {
        "n": n, "name": si["name_simple"], "ar": si["name_arabic"], "place": si["revelation_place"],
        "order": si["revelation_order"], "ayat": N, "pages": [meta["page"]["start"], meta["page"]["end"]],
        "juz": [meta["juz"]["start"], meta["juz"]["end"]], "hizb": [meta["hizb"]["start"], meta["hizb"]["end"]],
        "bismillah": si["bismillah_pre"], "sajdah": meta["sajdah"], "rukus": rukus,
        "prev": prev_key, "next": next_key, "edges": edges, "groupings": groupings,
    }
    json.dump(meta_out, open(os.path.join(d, "meta.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(trmap, open(os.path.join(d, "tr.json"), "w"), ensure_ascii=False, indent=1)
    json.dump({"en": en, "ar": ar, "qur": qur}, open(os.path.join(d, "tafsir.json"), "w"), ensure_ascii=False)

    B = [f"# Surah {n}: {si['name_simple']} ({si['name_arabic']})",
         f"{si['revelation_place']} · {N} ayat · muṣḥaf pages {meta['page']['start']}–{meta['page']['end']} · juz {meta['juz']['start']}",
         "", "## Rukus", ", ".join(f"{a}–{b}" for a, b in rukus) or "(none)",
         "", "## Passage groupings used by the tafsir editions (ayah ranges)"]
    for ed, ps in groupings.items():
        B.append(f"- {ed}: {', '.join(ps)}")
    B += ["", "## Translation (Sahih International)"]
    B += [f"{a}. {trmap.get(str(a), '')}" for a in range(1, N + 1)]
    if info["text"]:
        B += ["", f"## Surah introduction ({info['source']})", info["text"]]
    for ed, title in [("en-ibn-kathir", "Tafsir Ibn Kathir (English)"), ("en-maarif-ul-quran", "Maariful Quran (English)"),
                      ("en-tazkirul-quran", "Tazkirul Quran (English)")]:
        rows = en.get(ed, [])
        if rows:
            B += ["", f"## {title}"]
            for r in rows:
                B += [f"### [{r['range']}]", strip_html(r["text"], drop_arabic_divs=(ed == "en-ibn-kathir"))]
    for ed, title in [("ar-saadi", "Tafsir al-Saadi (Arabic)"), ("ar-jalalayn", "Tafsir al-Jalalayn (Arabic)"),
                      ("ar-baghawi", "Tafsir al-Baghawi (Arabic)")]:
        rows = ar.get(ed, [])
        if rows:
            B += ["", f"## {title}"]
            for r in rows:
                B += [f"### [{r['range']}]", strip_html(r["text"])]
    snips = []
    for r in qur.get("ar-qurtubi", []):
        t = strip_html(r["text"])
        for m in re.finditer(r"(نزلت|سبب نزول|نزل قوله|نزلت في|فأنزل الله)", t):
            snips.append(f"[{r['range']}] …{t[max(0, m.start() - 300):m.end() + 400]}…")
    if snips:
        B += ["", "## al-Qurtubi: revelation-report excerpts (Arabic)"] + snips   # all of them: long surahs have many
    open(os.path.join(d, "brief.md"), "w").write("\n".join(B))
    open(os.path.join(d, "done"), "w").write("ok")
    log("done", n, "brief chars", len("\n".join(B)))


def main():
    order = [int(x) for x in sys.argv[1:]] or ([70] + list(range(58, 70)) + list(range(71, 115)))
    idx_f = os.path.join(RAW, "juz.json")
    if not os.path.exists(idx_f):
        juz = {}
        for j in (28, 29, 30):
            m = mcp.tool("fetch_quran_metadata", {"juz": j})
            juz[j] = {"pages": [m["page"]["start"], m["page"]["end"]], "surahs": [s["number"] for s in m["surah"]]}
        json.dump(juz, open(idx_f, "w"), indent=1)
    for n in order:
        try:
            do_surah(n)
        except Exception as e:
            log("FAILED", n, str(e)[:300])
    log("all done")


if __name__ == "__main__":
    main()
