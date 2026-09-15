"""Check content/sNNN.json files written for the QuranFlow memory app.

Usage: python3 validate_content.py 70 71 ...   (no args = every content file)
Exit code 1 if any file has errors. Warnings don't fail.

Long surahs (over 110 ayat) are written in pieces first; long_surah.py reuses these checks for the pieces.
"""
import json
import os
import re
import sys

SP = os.path.dirname(os.path.abspath(__file__))
ARABIC = re.compile(r"[؀-ۏې-۝۟-ۿݐ-ݿﭐ-ﷹﷻ-﷿ﹰ-﻿]")  # ۞ (U+06DE) and ﷺ (U+FDFA) allowed
CITES = re.compile(r"\b(Ibn Kath[iī]r|Sa[ʿ'‘]?d[iī]|Jal[aā]layn|Baghaw[iī]|Qur[tṭ]ub[iī]|Ma[ʿ'‘]?[aā]rif|Tafh[iī]m|Tazkir|Ma[wu]dud[iī]|[TṬ]abar[iī]|Ibn [ʿ'‘]?Abb[aā]s|Muj[aā]hid|Qat[aā]dah|al-[HḤ]asan|[ʿ'‘]Ikrimah|Muq[aā]til|Zamakhshar[iī]|Kashsh[aā]f|Ibn [ʿ'‘]?[AĀ]sh[uū]r|scholars? (say|said|note)|commentators? (say|said))\b")
LONG = 110   # surahs with more ayat than this are written in pieces and have many shorter sections


def words(s):
    return len(re.findall(r"\S+", s))


def txt(errs, warns, label, v, max_words=None, required=True):
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


def check_top(errs, warns, c):
    """The surah-wide fields: sub, theme, story."""
    txt(errs, warns, "sub", c.get("sub"), 20)
    txt(errs, warns, "theme", c.get("theme"), 45)
    story = c.get("story")
    if not isinstance(story, list) or not 1 <= len(story) <= 4:
        errs.append("story: 1–4 paragraphs")
    else:
        for i, p in enumerate(story):
            txt(errs, warns, f"story[{i}]", p, 60)


def check_title(errs, warns, label, title):
    txt(errs, warns, label, title, 13)
    if isinstance(title, str) and words(title) < 5:
        warns.append(f"{label}: only {words(title)} words; make it descriptive (7–12)")


def check_sections(errs, warns, secs, first, last):
    """Sections run contiguously from `first` to `last`, each with every field filled."""
    if not secs:
        errs.append("sections: none")
    expect = first
    for i, s in enumerate(secs):
        L = f"sections[{i}]"
        if s.get("a") != expect:
            errs.append(f"{L}: starts at {s.get('a')}, expected {expect} (sections must be contiguous from {first})")
        if not isinstance(s.get("b"), int) or s["b"] < s.get("a", 0):
            errs.append(f"{L}: bad end {s.get('b')}")
            break
        expect = s["b"] + 1
        check_title(errs, warns, f"{L}.title", s.get("title"))
        txt(errs, warns, f"{L}.meaning", s.get("meaning"), 60)
        txt(errs, warns, f"{L}.matters", s.get("matters"), 55)
        txt(errs, warns, f"{L}.story", s.get("story"), 55)
        txt(errs, warns, f"{L}.hook", s.get("hook"), 40)
        pts = s.get("points") or []
        if not pts:
            errs.append(f"{L}.points: none")
        for j, pt in enumerate(pts):
            if not (isinstance(pt, list) and len(pt) == 2):
                errs.append(f"{L}.points[{j}]: must be [\"range\", \"text\"]")
            else:
                txt(errs, warns, f"{L}.points[{j}]", pt[1], 16)
        ex = s.get("explained") or []
        if not 1 <= len(ex) <= 3:
            errs.append(f"{L}.explained: 1–3 paragraphs")
        for j, p in enumerate(ex):
            txt(errs, warns, f"{L}.explained[{j}]", p, 70)
        te = s.get("teaches") or []
        if not 2 <= len(te) <= 6:
            errs.append(f"{L}.teaches: 2–6 items")
        for j, p in enumerate(te):
            txt(errs, warns, f"{L}.teaches[{j}]", p, 22)
    if expect != last + 1:
        errs.append(f"sections end at {expect - 1}, expected {last}")


def check_section_sizes(errs, warns, secs, N):
    """Up to 110 ayat: at most 8 sections. Longer surahs: as many sections as needed, each 3–40 ayat (aim 8–25)."""
    if N <= LONG:
        if len(secs) > 8:
            errs.append(f"{len(secs)} sections; use at most 8")
        return
    for i, s in enumerate(secs):
        if not isinstance(s.get("a"), int) or not isinstance(s.get("b"), int):
            continue
        size = s["b"] - s["a"] + 1
        if size > 40 or size < 3:
            errs.append(f"sections[{i}] {s['a']}–{s['b']}: {size} ayat; long surahs use sections of 3–40 ayat (aim 8–25)")
        elif size > 30 or size < 5:
            warns.append(f"sections[{i}] {s['a']}–{s['b']}: {size} ayat (aim 8–25)")


def check_groups(errs, warns, groups, secs, first, last):
    expect = first
    for i, g in enumerate(groups):
        if g.get("a") != expect:
            errs.append(f"groups[{i}]: starts at {g.get('a')}, expected {expect}")
        if not isinstance(g.get("b"), int) or g["b"] < g.get("a", 0):
            errs.append(f"groups[{i}]: bad end")
            break
        expect = g["b"] + 1
        if not any(s["a"] <= g["a"] and g["b"] <= s["b"] for s in secs if isinstance(s.get("b"), int) and isinstance(s.get("a"), int)):
            errs.append(f"groups[{i}] {g['a']}–{g['b']} crosses a section boundary")
        if g["b"] - g["a"] + 1 > 6:
            warns.append(f"groups[{i}] spans {g['b'] - g['a'] + 1} ayat (aim ≤ 5)")
        txt(errs, warns, f"groups[{i}].text", g.get("text"), 30)
    if expect != last + 1:
        errs.append(f"groups end at {expect - 1}, expected {last}")


def check_ayat(errs, warns, ayat, first, last):
    for a in range(first, last + 1):
        x = ayat.get(str(a))
        if not isinstance(x, dict):
            errs.append(f"ayat[{a}]: missing")
            continue
        txt(errs, warns, f"ayat[{a}].explain", x.get("explain"), 45)
        if "why" in x:
            txt(errs, warns, f"ayat[{a}].why", x.get("why"), 60)
    extra = set(ayat) - {str(a) for a in range(first, last + 1)}
    if extra:
        errs.append(f"ayat has keys outside {first}..{last}: {sorted(extra)[:5]}")


def check(n):
    errs, warns = [], []
    f = os.path.join(SP, "content", f"s{n:03d}.json")
    meta = json.load(open(os.path.join(SP, "raw", f"s{n:03d}", "meta.json")))
    N = meta["ayat"]
    try:
        c = json.load(open(f))
    except Exception as e:
        return [f"cannot read JSON: {e}"], []
    if c.get("n") != n:
        errs.append(f"n should be {n}")
    check_top(errs, warns, c)
    secs = c.get("sections") or []
    check_sections(errs, warns, secs, 1, N)
    check_section_sizes(errs, warns, secs, N)
    check_groups(errs, warns, c.get("groups") or [], secs, 1, N)
    check_ayat(errs, warns, c.get("ayat") or {}, 1, N)
    return errs, warns


def report(label, errs, warns):
    print(f"{label}: {'OK' if not errs else 'FAIL'} ({len(errs)} errors, {len(warns)} warnings)")
    for e in errs[:40]:
        print("   ERROR", e)
    for w in warns[:15]:
        print("   warn ", w)
    return bool(errs)


def main():
    ns = [int(x) for x in sys.argv[1:]]
    if not ns:
        ns = sorted(int(f[1:4]) for f in os.listdir(os.path.join(SP, "content")) if re.match(r"s\d{3}\.json$", f))
    bad = 0
    for n in ns:
        errs, warns = check(n)
        bad += report(f"s{n:03d}", errs, warns)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
