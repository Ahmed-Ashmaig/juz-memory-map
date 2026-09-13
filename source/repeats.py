"""Find ayat repeated within a surah, from the muṣḥaf words: exact repeats, and near repeats that
differ only by a leading ثم / كلا or a one-letter و/ف prefix on the first word."""
import re
MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ۞]")

def norm_tokens(words):
    out = []
    for w in words:
        w = MARKS.sub("", w)
        w = re.sub(r"[ٱأإآ]", "ا", w).replace("ى", "ي").replace("ة", "ه").replace("ۥ", "").replace("ۦ", "")
        w = w.strip()
        if w:
            out.append(w)
    return out

def core(tokens):
    t = list(tokens)
    while len(t) > 2 and t[0] in ("ثم",):
        t = t[1:]
    if t and len(t[0]) > 2 and t[0][0] in "وف":
        t = [t[0][1:]] + t[1:]
    return " ".join(t)

def find_repeats(ayah_words):
    """ayah_words: {ayah_number: [words]} -> list of groups {ayat, exact}"""
    by_core, exact_key = {}, {}
    for a, ws in sorted(ayah_words.items()):
        toks = norm_tokens(ws)
        if len(toks) < 2:
            continue
        exact_key[a] = " ".join(toks)
        by_core.setdefault(core(toks), []).append(a)
    groups = []
    for key, ayat in by_core.items():
        if len(ayat) < 2:
            continue
        exacts = {exact_key[a] for a in ayat}
        groups.append({"ayat": ayat, "exact": len(exacts) == 1})
    return sorted(groups, key=lambda g: g["ayat"][0])
