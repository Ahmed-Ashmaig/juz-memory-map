"""Assemble the multi-file artifact in site/ from raw/ data and validated content/.

Writes site/data/index.js, site/data/sNNN.js for every surah whose content passes
validation, and site/app.js (src/core.js + src/surah.js + src/boot.js).
"""
import json
import os
import sys

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
import validate_content as V  # noqa: E402
from repeats import find_repeats  # noqa: E402

RAW, CONTENT, SITE = (os.path.join(SP, x) for x in ("raw", "content", "site"))
from coverage import FIRST  # noqa: E402  (the first surah the app covers)
os.makedirs(os.path.join(SITE, "data"), exist_ok=True)
BASMALA = json.load(open(os.path.join(RAW, "basmala.json"), encoding="utf-8"))["basmala"]


def load(path):
    return json.load(open(path, encoding="utf-8"))


juz = load(os.path.join(RAW, "juz.json"))

# Surah title and basmala lines for every cached page. The data gives "appears_before_line";
# when a surah starts on line 2 with a basmala, the title sits on line 15 of the previous page.
PAGES = {}
for f in os.listdir(os.path.join(RAW, "pages")):
    pg = load(os.path.join(RAW, "pages", f))
    pg["specials"] = []
    PAGES[pg["p"]] = pg
for p in sorted(PAGES):
    for h in PAGES[p]["headers"]:
        b = h["before"]
        name_at = (p, b - 2) if h["bism"] else (p, b - 1)
        if name_at[1] < 1:
            name_at = (p - 1, 15)
        if name_at[0] in PAGES:
            PAGES[name_at[0]]["specials"].append({"n": name_at[1], "k": "name", "ar": h["ar"]})
        if h["bism"]:
            PAGES[p]["specials"].append({"n": b - 1, "k": "bism", "ar": h["ar"]})

# Page numbers in the metadata come from a different print than the drawn muṣḥaf layout,
# so derive every surah's pages (and edge-ayah text) from the layout itself.
SURAH_PAGES, KEY_WORDS = {}, {}
for p in sorted(PAGES):
    for ln in PAGES[p]["lines"]:
        for t, s, a, end in ln["w"]:
            SURAH_PAGES.setdefault(s, set()).add(p)
            KEY_WORDS.setdefault(f"{s}:{a}", {"pages": [], "words": []})
            if p not in KEY_WORDS[f"{s}:{a}"]["pages"]:
                KEY_WORDS[f"{s}:{a}"]["pages"].append(p)
            if not end:
                KEY_WORDS[f"{s}:{a}"]["words"].append(t)
# ---------- Similars tab: groups of similar ayat across the whole Quran (see similars.py) ----------
SIM_DIR = os.path.join(RAW, "similars")
QWORDS = {}
qdir = os.path.join(RAW, "quran-pages")
if os.path.isdir(qdir):
    for f in sorted(os.listdir(qdir)):
        for ln in load(os.path.join(qdir, f))["lines"]:
            for t, s, a, end in ln["w"]:
                if not end:
                    QWORDS.setdefault(f"{s}:{a}", []).append(t)
LAST_AYAH = {}
for k in list(QWORDS) + list(KEY_WORDS):
    s_, a_ = map(int, k.split(":"))
    LAST_AYAH[s_] = max(LAST_AYAH.get(s_, 0), a_)
CHAPTERS = load(os.path.join(RAW, "chapters.json")) if os.path.exists(os.path.join(RAW, "chapters.json")) else {}
TR_EXTRA = load(os.path.join(SIM_DIR, "tr_extra.json")) if os.path.exists(os.path.join(SIM_DIR, "tr_extra.json")) else {}
_tr_cache = {}


def tr_of(k):
    s_, a_ = k.split(":")
    if os.path.exists(os.path.join(RAW, f"s{int(s_):03d}", "tr.json")):
        if s_ not in _tr_cache:
            _tr_cache[s_] = load(os.path.join(RAW, f"s{int(s_):03d}", "tr.json"))
        return _tr_cache[s_].get(a_, "")
    return TR_EXTRA.get(k, "")


def text_of(k):
    return " ".join(KEY_WORDS[k]["words"]) if k in KEY_WORDS else " ".join(QWORDS.get(k, []))


def step_key(k, d):
    s_, a_ = map(int, k.split(":"))
    a_ += d
    if a_ < 1:
        s_ -= 1
        if s_ < 1:
            return None
        a_ = LAST_AYAH.get(s_, 0)
    elif a_ > LAST_AYAH.get(s_, 0):
        s_, a_ = s_ + 1, 1
        if s_ > 114:
            return None
    return f"{s_}:{a_}"


def ayah_ref(k):
    return {"k": k, "text": text_of(k), "tr": tr_of(k)} if k else None


def similars_for(n):
    f = os.path.join(SIM_DIR, f"s{n:03d}.json")
    if not os.path.exists(f):
        return []
    cf = os.path.join(CONTENT, "similars", f"s{n:03d}.json")
    flows = load(cf).get("groups", {}) if os.path.exists(cf) else {}
    out = []
    for g in load(f)["groups"]:
        fl = flows.get(g["id"], {})
        out.append({
            "id": g["id"], "kind": g["kind"], "more": g["more"], "flow": fl.get("flow", ""),
            "members": [{**m, "name": CHAPTERS.get(m["k"].split(":")[0], {}).get("name", ""),
                         "text": text_of(m["k"]), "tr": tr_of(m["k"]), "cue": fl.get("cues", {}).get(m["k"], ""),
                         "before": ayah_ref(step_key(m["k"], -1)), "after": ayah_ref(step_key(m["k"], 1))}
                        for m in g["members"]],
        })
    return out


surahs, ready, skipped = {}, [], []
for n in range(FIRST, 115):
    mf = os.path.join(RAW, f"s{n:03d}", "meta.json")
    if not os.path.exists(mf):
        continue
    m = load(mf)
    pages_n = sorted(SURAH_PAGES.get(n, [])) or m["pages"]
    surahs[n] = {"n": n, "name": m["name"], "ar": m["ar"], "place": m["place"], "ayat": m["ayat"],
                 "pages": [pages_n[0], pages_n[-1]], "juz": m["juz"], "hizb": m["hizb"]}
# The surah just before the first one only needs a name, for the "before this section" card.
if FIRST - 1 not in surahs and str(FIRST - 1) in CHAPTERS:
    ch = CHAPTERS[str(FIRST - 1)]
    surahs[FIRST - 1] = {"n": FIRST - 1, "name": ch["name"], "ar": ch["ar"], "ayat": ch["ayat"],
                         "pages": sorted(SURAH_PAGES.get(FIRST - 1, []))[:1] * 2, "juz": [], "hizb": []}

for n in sorted(k for k in surahs if k >= FIRST):
    cf = os.path.join(CONTENT, f"s{n:03d}.json")
    if not os.path.exists(cf):
        continue
    errs, _ = V.check(n)
    if errs:
        skipped.append((n, errs[:3]))
        continue
    c = load(cf)
    m = load(os.path.join(RAW, f"s{n:03d}", "meta.json"))
    m["pages"] = surahs[n]["pages"]
    missing = [a for a in range(1, m["ayat"] + 1) if not KEY_WORDS.get(f"{n}:{a}")]
    if missing:
        skipped.append((n, [f"ayat missing from page layout: {missing[:6]}"]))
        continue
    for k, v in m["edges"].items():
        kw = KEY_WORDS.get(k)
        if kw:
            m["edges"][k] = {**v, "page": kw["pages"][0], "text": " ".join(kw["words"])}
    pages = [PAGES[p] for p in range(m["pages"][0], m["pages"][1] + 1)]
    data = {
        "meta": {k: m[k] for k in ("ar", "place", "ayat", "pages", "juz", "hizb", "sajdah", "prev", "next")},
        "pages": pages,
        "tr": load(os.path.join(RAW, f"s{n:03d}", "tr.json")),
        "edges": m["edges"],
        "content": c,
        "repeats": find_repeats({a: KEY_WORDS[f"{n}:{a}"]["words"] for a in range(1, m["ayat"] + 1)}),
        "similars": similars_for(n),
    }
    js = f"(window.JUZAPP_SURAH = window.JUZAPP_SURAH || {{}})[{n}] = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(os.path.join(SITE, "data", f"s{n:03d}.js"), "w", encoding="utf-8").write(js)
    surahs[n]["firstSection"] = {"title": c["sections"][0]["title"], "meaning": c["sections"][0]["meaning"]}
    surahs[n]["lastSection"] = {"title": c["sections"][-1]["title"], "meaning": c["sections"][-1]["meaning"]}
    ready.append(n)

for k, v in juz.items():
    # a juz that starts or ends mid-surah gives its first and last ayah; take their pages from the layout
    if v.get("start") in KEY_WORDS and v.get("end") in KEY_WORDS:
        v["pages"] = [KEY_WORDS[v["start"]]["pages"][0], KEY_WORDS[v["end"]]["pages"][-1]]
        continue
    ps = [p for s in v["surahs"] if s in surahs for p in surahs[s]["pages"]]
    if ps:
        v["pages"] = [min(ps), max(ps)]
index = {"juz": {int(k): v for k, v in juz.items()}, "surahs": surahs, "ready": ready, "basmala": BASMALA}
open(os.path.join(SITE, "data", "index.js"), "w", encoding="utf-8").write(
    "window.JUZAPP_INDEX = " + json.dumps(index, ensure_ascii=False, separators=(",", ":")) + ";\n")
app = "\n".join(open(os.path.join(SITE, "src", f), encoding="utf-8").read() for f in ("core.js", "surah.js", "boot.js"))
open(os.path.join(SITE, "app.js"), "w", encoding="utf-8").write(app)

print(f"ready ({len(ready)}):", ready)
for n, e in skipped:
    print(f"skipped s{n:03d}:", e)
