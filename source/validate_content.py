"""Check content/sNNN.json files written for the Juz 28–30 memory app.

Usage: python3 validate_content.py 70 71 ...   (no args = every content file)
Exit code 1 if any file has errors. Warnings don't fail.
"""
import json
import os
import re
import sys

SP = os.path.dirname(os.path.abspath(__file__))
ARABIC = re.compile(r"[؀-ۏې-۝۟-ۿݐ-ݿﭐ-ﷹﷻ-﷿ﹰ-﻿]")  # ۞ (U+06DE) and ﷺ (U+FDFA) allowed
CITES = re.compile(r"\b(Ibn Kath[iī]r|Sa[ʿ'‘]?d[iī]|Jal[aā]layn|Baghaw[iī]|Qur[tṭ]ub[iī]|Ma[ʿ'‘]?[aā]rif|Tafh[iī]m|Tazkir|Ma[wu]dud[iī]|[TṬ]abar[iī]|Ibn [ʿ'‘]?Abb[aā]s|Muj[aā]hid|Qat[aā]dah|al-[HḤ]asan|[ʿ'‘]Ikrimah|Muq[aā]til|Zamakhshar[iī]|Kashsh[aā]f|Ibn [ʿ'‘]?[AĀ]sh[uū]r|scholars? (say|said|note)|commentators? (say|said))\b")


def words(s):
    return len(re.findall(r"\S+", s))


def check(n):
    errs, warns = [], []
    f = os.path.join(SP, "content", f"s{n:03d}.json")
    meta = json.load(open(os.path.join(SP, "raw", f"s{n:03d}", "meta.json")))
    N = meta["ayat"]
    try:
        c = json.load(open(f))
    except Exception as e:
        return [f"cannot read JSON: {e}"], []

    def txt(label, v, max_words=None, required=True):
        if not isinstance(v, str) or not v.strip():
            if required:
                errs.append(f"{label}: missing or empty")
            return
        if ARABIC.search(v):
            errs.append(f"{label}: contains Arabic script (write transliteration only)")
        if CITES.search(v):
            errs.append(f"{label}: names a source ({CITES.search(v).group(0)}); keep it citation-free")
        if max_words and words(v) > max_words:
            (errs if words(v) > max_words * 1.5 else warns).append(f"{label}: {words(v)} words (aim ≤ {max_words})")

    if c.get("n") != n:
        errs.append(f"n should be {n}")
    txt("sub", c.get("sub"), 20)
    txt("theme", c.get("theme"), 45)
    story = c.get("story")
    if not isinstance(story, list) or not 1 <= len(story) <= 4:
        errs.append("story: 1–4 paragraphs")
    else:
        for i, p in enumerate(story):
            txt(f"story[{i}]", p, 60)

    secs = c.get("sections") or []
    if not secs:
        errs.append("sections: none")
    expect = 1
    for i, s in enumerate(secs):
        L = f"sections[{i}]"
        if s.get("a") != expect:
            errs.append(f"{L}: starts at {s.get('a')}, expected {expect} (sections must be contiguous from 1)")
        if not isinstance(s.get("b"), int) or s["b"] < s.get("a", 0):
            errs.append(f"{L}: bad end {s.get('b')}")
            break
        expect = s["b"] + 1
        txt(f"{L}.title", s.get("title"), 9)
        txt(f"{L}.meaning", s.get("meaning"), 60)
        txt(f"{L}.matters", s.get("matters"), 55)
        txt(f"{L}.story", s.get("story"), 55)
        txt(f"{L}.hook", s.get("hook"), 40)
        pts = s.get("points") or []
        if not pts:
            errs.append(f"{L}.points: none")
        for j, pt in enumerate(pts):
            if not (isinstance(pt, list) and len(pt) == 2):
                errs.append(f"{L}.points[{j}]: must be [\"range\", \"text\"]")
            else:
                txt(f"{L}.points[{j}]", pt[1], 16)
        ex = s.get("explained") or []
        if not 1 <= len(ex) <= 3:
            errs.append(f"{L}.explained: 1–3 paragraphs")
        for j, p in enumerate(ex):
            txt(f"{L}.explained[{j}]", p, 70)
        te = s.get("teaches") or []
        if not 2 <= len(te) <= 6:
            errs.append(f"{L}.teaches: 2–6 items")
        for j, p in enumerate(te):
            txt(f"{L}.teaches[{j}]", p, 22)
    if expect != N + 1:
        errs.append(f"sections end at {expect - 1}, surah has {N} ayat")
    if len(secs) > 8:
        errs.append(f"{len(secs)} sections; use at most 8")

    groups = c.get("groups") or []
    expect = 1
    for i, g in enumerate(groups):
        if g.get("a") != expect:
            errs.append(f"groups[{i}]: starts at {g.get('a')}, expected {expect}")
        if not isinstance(g.get("b"), int) or g["b"] < g.get("a", 0):
            errs.append(f"groups[{i}]: bad end")
            break
        expect = g["b"] + 1
        if not any(s["a"] <= g["a"] and g["b"] <= s["b"] for s in secs if isinstance(s.get("b"), int)):
            errs.append(f"groups[{i}] {g['a']}–{g['b']} crosses a section boundary")
        if g["b"] - g["a"] + 1 > 6:
            warns.append(f"groups[{i}] spans {g['b'] - g['a'] + 1} ayat (aim ≤ 5)")
        txt(f"groups[{i}].text", g.get("text"), 30)
    if expect != N + 1:
        errs.append(f"groups end at {expect - 1}, surah has {N} ayat")

    ayat = c.get("ayat") or {}
    for a in range(1, N + 1):
        x = ayat.get(str(a))
        if not isinstance(x, dict):
            errs.append(f"ayat[{a}]: missing")
            continue
        txt(f"ayat[{a}].explain", x.get("explain"), 45)
        if "why" in x:
            txt(f"ayat[{a}].why", x.get("why"), 60)
    extra = set(ayat) - {str(a) for a in range(1, N + 1)}
    if extra:
        errs.append(f"ayat has keys outside 1..{N}: {sorted(extra)[:5]}")
    return errs, warns


def main():
    ns = [int(x) for x in sys.argv[1:]]
    if not ns:
        ns = sorted(int(f[1:4]) for f in os.listdir(os.path.join(SP, "content")) if re.match(r"s\d{3}\.json$", f))
    bad = 0
    for n in ns:
        errs, warns = check(n)
        status = "OK" if not errs else "FAIL"
        print(f"s{n:03d}: {status} ({len(errs)} errors, {len(warns)} warnings)")
        for e in errs[:40]:
            print("   ERROR", e)
        for w in warns[:15]:
            print("   warn ", w)
        bad += bool(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
