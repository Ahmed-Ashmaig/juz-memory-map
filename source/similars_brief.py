"""Write raw/similars/brief-sNNN.md for each surah with similar-ayah groups: the input for the writers of
content/similars/sNNN.json (see SIMILARS_STYLE.md)."""
import json
import os
import sys
from collections import defaultdict

SP = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(SP, "raw")
SIM = os.path.join(RAW, "similars")

words = defaultdict(list)
for d in ("quran-pages", "pages"):
    folder = os.path.join(RAW, d)
    for f in sorted(os.listdir(folder)):
        pg = json.load(open(os.path.join(folder, f), encoding="utf-8"))
        if d == "quran-pages" and pg["p"] > 540:
            continue
        for ln in pg["lines"]:
            for t, s, a, end in ln["w"]:
                if not end:
                    words[f"{s}:{a}"].append(t)
last = defaultdict(int)
for k in words:
    s, a = map(int, k.split(":"))
    last[s] = max(last[s], a)
chapters = json.load(open(os.path.join(RAW, "chapters.json"), encoding="utf-8"))
tr = dict(json.load(open(os.path.join(SIM, "tr_extra.json"), encoding="utf-8")))
for n in range(58, 115):
    for a, t in json.load(open(os.path.join(RAW, f"s{n:03d}", "tr.json"), encoding="utf-8")).items():
        tr[f"{n}:{a}"] = t


def step(k, d):
    s, a = map(int, k.split(":"))
    a += d
    if a < 1:
        return f"{s - 1}:{last[s - 1]}" if s > 1 else None
    if a > last[s]:
        return f"{s + 1}:1" if s < 114 else None
    return f"{s}:{a}"


made = 0
for n in [int(x) for x in sys.argv[1:]] or range(58, 115):
    groups = json.load(open(os.path.join(SIM, f"s{n:03d}.json"), encoding="utf-8"))["groups"]
    if not groups:
        continue
    L = [f"# Similars brief: Surah {n} {chapters[str(n)]['name']}", "",
         "Each group lists every occurrence in muṣḥaf order. \"DIFFERS\" lists the words that differ from the first occurrence in this surah.", ""]
    for g in groups:
        kind = {"within": "repeated within this surah", "cross": "matches ayat in other surahs", "both": "repeated here and in other surahs"}[g["kind"]]
        L += [f"## {g['id']}: {kind} · {len(g['members'])} occurrences" + (f" (+{g['more']} more not shown)" if g["more"] else ""), ""]
        for m in g["members"]:
            s = m["k"].split(":")[0]
            ws = words[m["k"]]
            L += [f"### {m['k']}: {chapters[s]['name']}, page {m['page']}, {'same words' if m['exact'] else 'words differ'}"]
            b, a = step(m["k"], -1), step(m["k"], 1)
            if b:
                L.append(f"- Before ({b}): {tr.get(b, '')}")
            L.append(f"- THE AYAH: {' '.join(ws)} | {tr.get(m['k'], '')}")
            if m["diff"]:
                L.append(f"- DIFFERS: {' '.join(ws[i] for i in m['diff'] if i < len(ws))}")
            if a:
                L.append(f"- After ({a}): {tr.get(a, '')}")
            L.append("")
    open(os.path.join(SIM, f"brief-s{n:03d}.md"), "w", encoding="utf-8").write("\n".join(L))
    made += 1
print("briefs written:", made)
