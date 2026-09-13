"""Check content/similars/sNNN.json (order cues for the Similars tab) against raw/similars/sNNN.json.

Usage: python3 validate_similars.py 77 94 ...   (no args = every surah that has similar-ayah groups)
"""
import json
import os
import re
import sys

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
from validate_content import ARABIC, CITES, words  # noqa: E402


def check(n):
    errs = []
    groups = json.load(open(os.path.join(SP, "raw", "similars", f"s{n:03d}.json"), encoding="utf-8"))["groups"]
    f = os.path.join(SP, "content", "similars", f"s{n:03d}.json")
    if not groups:
        return errs
    if not os.path.exists(f):
        return [f"missing {os.path.relpath(f, SP)}"]
    try:
        c = json.load(open(f, encoding="utf-8"))
    except Exception as e:
        return [f"cannot read JSON: {e}"]
    got = c.get("groups") or {}

    def txt(label, v, limit):
        if not isinstance(v, str) or not v.strip():
            errs.append(f"{label}: missing or empty")
            return
        if ARABIC.search(v):
            errs.append(f"{label}: contains Arabic script (use transliteration)")
        if CITES.search(v):
            errs.append(f"{label}: names a source ({CITES.search(v).group(0)})")
        if words(v) > limit * 1.4:
            errs.append(f"{label}: {words(v)} words (aim ≤ {limit})")

    for g in groups:
        gid, keys = g["id"], [m["k"] for m in g["members"]]
        x = got.get(gid)
        if not isinstance(x, dict):
            errs.append(f"{gid}: missing")
            continue
        txt(f"{gid}.flow", x.get("flow"), 70)
        cues = x.get("cues") or {}
        for k in keys:
            txt(f"{gid}.cues[{k}]", cues.get(k), 16)
        extra = set(cues) - set(keys)
        if extra:
            errs.append(f"{gid}.cues has keys not in the group: {sorted(extra)}")
    extra_groups = set(got) - {g["id"] for g in groups}
    if extra_groups:
        errs.append(f"groups not in raw/similars: {sorted(extra_groups)}")
    return errs


def main():
    ns = [int(x) for x in sys.argv[1:]]
    if not ns:
        d = os.path.join(SP, "raw", "similars")
        ns = [int(f[1:4]) for f in sorted(os.listdir(d)) if re.match(r"s\d{3}\.json$", f)
              and json.load(open(os.path.join(d, f)))["groups"]]
    bad = 0
    for n in ns:
        errs = check(n)
        print(f"s{n:03d}: {'OK' if not errs else 'FAIL'}")
        for e in errs[:30]:
            print("   ERROR", e)
        bad += bool(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
