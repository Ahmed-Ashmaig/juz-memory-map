"""Find groups of similar ayat for each surah in Juz 28–30, searching the whole Quran.

Reads the muṣḥaf word layout (raw/pages for 541–604, raw/quran-pages for 1–540) and writes
raw/similars/sNNN.json plus raw/similars/needed_keys.json (every ayah whose meaning the Similars
tab shows: group members and the ayat just before and after them).

Two ayat are "similar" when their word sequences (diacritics stripped) are identical, differ only by a
leading ثم / و / ف, or match closely overall (difflib ratio ≥ 0.8, which in practice means one word
added, dropped or changed in an ayah of five or more words).
"""
import difflib
import json
import os
import sys
from collections import defaultdict

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
from repeats import norm_tokens, core  # noqa: E402

RAW = os.path.join(SP, "raw")
OUT = os.path.join(RAW, "similars")
os.makedirs(OUT, exist_ok=True)
from coverage import FIRST  # noqa: E402
LAST = 114
MAX_MEMBERS = 16
RATIO = 0.8

# ---------- load every ayah's words and first page ----------
words, page_of = defaultdict(list), {}
for d in ("quran-pages", "pages"):
    folder = os.path.join(RAW, d)
    for f in sorted(os.listdir(folder)):
        pg = json.load(open(os.path.join(folder, f), encoding="utf-8"))
        for ln in pg["lines"]:
            for t, s, a, end in ln["w"]:
                k = (s, a)
                page_of.setdefault(k, pg["p"])
                # pages 1–540 come from quran-pages, 541+ from pages (raw/pages also holds 477–540 now)
                if not end and (pg["p"] > 540 if d == "pages" else pg["p"] <= 540):
                    words[k].append(t)
missing_pages = [p for p in range(1, 605) if not os.path.exists(os.path.join(RAW, "quran-pages" if p <= 540 else "pages", f"p{p:03d}.json"))]
if missing_pages:
    sys.exit(f"missing muṣḥaf pages: {missing_pages[:10]}… run fetch_quran_pages.py first")

keys = sorted(words)
last_ayah = defaultdict(int)
for s, a in keys:
    last_ayah[s] = max(last_ayah[s], a)
toks = {k: norm_tokens(words[k]) for k in keys}

# ---------- candidate pairs via shared word pairs/triples ----------
index = defaultdict(list)
for k in keys:
    t = toks[k]
    if len(t) < 2:
        continue
    for n in (2, 3):           # word pairs and triples, so short and long look-alikes meet
        if len(t) < n:
            continue
        for g in {tuple(t[i:i + n]) for i in range(len(t) - n + 1)}:
            index[(n, g)].append(k)

def similar(a, b):
    ta, tb = toks[a], toks[b]
    if ta == tb:
        return True, True
    if len(ta) >= 2 and len(tb) >= 2 and core(ta) == core(tb):
        return True, False
    if min(len(ta), len(tb)) >= 4 and difflib.SequenceMatcher(None, ta, tb, autojunk=False).ratio() >= RATIO:
        return True, False
    return False, False

pairs = {}
for (n, g), ks in index.items():
    if len(ks) > 80:          # formula so common it would link unrelated ayat
        continue
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            a, b = ks[i], ks[j]
            if (a, b) in pairs:
                continue
            ok, exact = similar(a, b)
            if ok:
                pairs[(a, b)] = exact

# ---------- connected components ----------
parent = {}
def find(x):
    parent.setdefault(x, x)
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
for a, b in pairs:
    parent[find(a)] = find(b)
components = defaultdict(set)
for a, b in pairs:
    components[find(a)].update((a, b))

def ratio(a, b):
    return 1.0 if toks[a] == toks[b] else difflib.SequenceMatcher(None, toks[a], toks[b], autojunk=False).ratio()

def diff_indices(anchor, member):
    """Word positions in `member` that differ from `anchor` (for highlighting)."""
    if toks[anchor] == toks[member]:
        return []
    sm = difflib.SequenceMatcher(None, toks[anchor], toks[member], autojunk=False)
    same = set()
    for blk in sm.get_matching_blocks():
        same.update(range(blk.b, blk.b + blk.size))
    return [i for i in range(len(toks[member])) if i not in same]

def neighbours(k):
    s, a = k
    before = (s, a - 1) if a > 1 else ((s - 1, last_ayah[s - 1]) if s > 1 else None)
    after = (s, a + 1) if a < last_ayah[s] else ((s + 1, 1) if s < 114 else None)
    return before, after

key_str = lambda k: f"{k[0]}:{k[1]}"
needed = set()
summary = []
for n in range(FIRST, LAST + 1):
    groups = []
    for comp in components.values():
        mine = sorted(k for k in comp if k[0] == n)
        if not mine:
            continue
        members = sorted(comp)
        more = 0
        if len(members) > MAX_MEMBERS:
            ranked = sorted((k for k in members if k[0] != n), key=lambda k: -max(ratio(k, m) for m in mine))
            keep = set(mine) | set(ranked[:max(0, MAX_MEMBERS - len(mine))])
            more = len(members) - len(keep)
            members = sorted(keep)
        anchor = mine[0]
        kind = "within" if all(k[0] == n for k in members) else ("cross" if len(mine) == 1 else "both")
        groups.append({
            "kind": kind,
            "anchor": key_str(anchor),
            "more": more,
            "members": [{"k": key_str(k), "page": page_of[k], "exact": toks[k] == toks[anchor],
                         "diff": diff_indices(anchor, k)} for k in members],
        })
        for k in members:
            needed.add(key_str(k))
            for nb in neighbours(k):
                if nb:
                    needed.add(key_str(nb))
    groups.sort(key=lambda g: int(g["anchor"].split(":")[1]))
    for i, g in enumerate(groups, 1):
        g["id"] = f"g{i}"
    json.dump({"surah": n, "groups": groups}, open(os.path.join(OUT, f"s{n:03d}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if groups:
        summary.append((n, len(groups), sum(len(g["members"]) for g in groups), sum(1 for g in groups if g["kind"] != "within")))

json.dump(sorted(needed, key=lambda k: tuple(map(int, k.split(":")))), open(os.path.join(OUT, "needed_keys.json"), "w"))
print(f"similar pairs across the Quran: {len(pairs)}; surahs with groups: {len(summary)}; keys needing meanings: {len(needed)}")
for n, g, m, c in summary:
    print(f"  s{n:03d}: {g} groups, {m} occurrences, {c} reaching other surahs")
