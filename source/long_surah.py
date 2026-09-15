"""Write a long surah (over 110 ayat) in pieces: a plan, then chunks written in parallel, then a merge.

  python3 long_surah.py plan-brief NNN        write raw/sNNN/brief-plan.md for the planner
  python3 long_surah.py check-plan NNN        check content/plan/sNNN.json
  python3 long_surah.py chunk-briefs NNN      write raw/sNNN/brief-A-B.md for every chunk in the plan
  python3 long_surah.py check-chunk NNN A B   check content/chunks/sNNN-A-B.json against the plan
  python3 long_surah.py merge NNN             join the plan and its chunks into content/sNNN.json and validate it

Why: a long surah's brief (all the tafsir for every ayah) is far bigger than one writer should read. The planner reads
a slim brief and fixes the surah-wide fields and every section's range and title; each chunk writer reads only the
tafsir that touches its ayat. The writers' instructions are in LONG_SURAHS.md; STYLE.md governs the content itself.
"""
import json
import os
import re
import sys

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
import validate_content as V  # noqa: E402

RAW = os.path.join(SP, "raw")
CONTENT = os.path.join(SP, "content")
PLAN_DIR = os.path.join(CONTENT, "plan")
CHUNK_DIR = os.path.join(CONTENT, "chunks")

ENTRY = re.compile(r"^### \[\d+:(\d+)(?:-(?:\d+:)?(\d+))?\]\s*$")    # a tafsir passage: "### [2:1-5]"
SNIP = re.compile(r"^\[\d+:(\d+)(?:-(?:\d+:)?(\d+))?\] …")            # a revelation-report excerpt: "[2:1-5] …"
AYAH_LINE = re.compile(r"^(\d+)\. ")                                   # a translation line: "5. …"
SPAN = re.compile(r"^(\d+)(?:-(?:\d+:)?(\d+))?$")                      # a passage range in the groupings: "1-13"


def meta(n):
    return json.load(open(os.path.join(RAW, f"s{n:03d}", "meta.json"), encoding="utf-8"))


def plan_path(n):
    return os.path.join(PLAN_DIR, f"s{n:03d}.json")


def chunk_path(n, a, b):
    return os.path.join(CHUNK_DIR, f"s{n:03d}-{a}-{b}.json")


def read_brief(n):
    """Split brief.md into its header lines and its '## ' blocks."""
    head, blocks, cur = [], [], None
    for ln in open(os.path.join(RAW, f"s{n:03d}", "brief.md"), encoding="utf-8").read().split("\n"):
        if ln.startswith("## "):
            cur = (ln[3:].strip(), [])
            blocks.append(cur)
        elif cur is None:
            head.append(ln)
        else:
            cur[1].append(ln)
    return head, blocks


def split_entries(lines, start):
    """Group a block's lines into entries that each begin with a line matching `start`; returns [((a, b), lines)]."""
    out, cur = [], None
    for ln in lines:
        m = start.match(ln)
        if m:
            cur = ((int(m.group(1)), int(m.group(2) or m.group(1))), [ln])
            out.append(cur)
        elif cur:
            cur[1].append(ln)
    return out


def touches(span, a, b):
    return span[0] <= b and span[1] >= a


def write(path, lines):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = "\n".join(lines).rstrip() + "\n"
    open(path, "w", encoding="utf-8").write(text)
    print(f"wrote {os.path.relpath(path, SP)} ({len(text) // 1000}k chars)")


# ---------- briefs ----------

def plan_brief(n, out_dir=None):
    head, blocks = read_brief(n)
    N = meta(n)["ayat"]
    out = head[:2] + ["", f"PLANNING BRIEF — Surah {n} has {N} ayat, so it is written in pieces (see LONG_SURAHS.md). "
                          "This brief has what the plan needs: every ayah's meaning, the rukus, the passage groupings, "
                          "the surah introduction and an outline of the tafsir passages. The chunk briefs carry the full tafsir.", ""]
    for name, body in blocks:
        if name.startswith(("Rukus", "Passage groupings", "Translation", "Surah introduction")):
            out += [f"## {name}"] + body
        elif name.startswith(("Tafsir Ibn Kathir", "Maariful Quran")):
            out.append(f"## {name}: outline (each passage's range, its headings and its opening words)")
            for _, ls in split_entries(body, ENTRY):
                out.append(ls[0])
                heads = [l for l in ls[1:] if l.startswith("### ")][:12]
                first = next((l.strip() for l in ls[1:] if l.strip() and not l.startswith("### ")), "")
                out += heads + ([first[:300] + ("…" if len(first) > 300 else "")] if first else [])
        elif name.startswith("al-Qurtubi"):
            spans = sorted({span for span, _ in split_entries(body, SNIP)})
            if spans:
                out += [f"## {name}: ayat that have a revelation report (the excerpts are in the chunk briefs)",
                        ", ".join(str(a) if a == b else f"{a}-{b}" for a, b in spans)]
    write(os.path.join(out_dir or os.path.join(RAW, f"s{n:03d}"), "brief-plan.md"), out)


def chunk_brief(n, a, b, plan=None, out_dir=None):
    head, blocks = read_brief(n)
    N = meta(n)["ayat"]
    ca, cb = max(1, a - 2), min(N, b + 2)
    out = head[:2] + ["", f"CHUNK BRIEF — ayat {a}–{b} of Surah {n} ({N} ayat). Write entries only for ayat {a}–{b}; "
                          f"the translation of ayat {ca}–{cb} outside that range is shown as context.", ""]
    if plan:
        out += ["## The plan for the whole surah (the sections in this chunk are marked ▶)",
                f"Theme: {plan.get('theme', '')}"]
        out += [f"{'▶' if a <= s['a'] and s['b'] <= b else ' '} {s['a']}–{s['b']}: {s['title']}" for s in plan["sections"]]
        out.append("")
    for name, body in blocks:
        if name.startswith(("Rukus", "Surah introduction")):
            out += [f"## {name}"] + body
        elif name.startswith("Passage groupings"):
            out.append(f"## {name} (only the passages touching ayat {a}–{b})")
            for ln in body:
                m = re.match(r"^- ([^:]+): (.*)$", ln)
                if not m:
                    continue
                keep = []
                for part in (p.strip() for p in m.group(2).split(",")):
                    s = SPAN.match(part)
                    if s and touches((int(s.group(1)), int(s.group(2) or s.group(1))), a, b):
                        keep.append(part)
                if keep:
                    out.append(f"- {m.group(1)}: {', '.join(keep)}")
        elif name.startswith("Translation"):
            out.append(f"## {name}")
            for ln in body:
                m = AYAH_LINE.match(ln)
                if m and ca <= int(m.group(1)) <= cb:
                    out.append(ln if a <= int(m.group(1)) <= b else f"{ln}   [context]")
        else:   # a tafsir edition, or the revelation-report excerpts
            keep = [ls for span, ls in split_entries(body, SNIP if name.startswith("al-Qurtubi") else ENTRY) if touches(span, a, b)]
            if keep:
                out += [f"## {name}"] + [l for ls in keep for l in ls]
    write(os.path.join(out_dir or os.path.join(RAW, f"s{n:03d}"), f"brief-{a}-{b}.md"), out)


# ---------- checks ----------

def load(path):
    try:
        return json.load(open(path, encoding="utf-8")), None
    except FileNotFoundError:
        return None, f"missing {os.path.relpath(path, SP)}"
    except Exception as e:
        return None, f"cannot read {os.path.relpath(path, SP)}: {e}"


def plan_issues(n, plan=None):
    N = meta(n)["ayat"]
    errs, warns = [], []
    if plan is None:
        plan, err = load(plan_path(n))
        if err:
            return [err], []
    if plan.get("n") != n:
        errs.append(f"n should be {n}")
    V.check_top(errs, warns, plan)
    secs = plan.get("sections") or []
    if not secs:
        errs.append("sections: none")
    expect = 1
    for i, s in enumerate(secs):
        if s.get("a") != expect:
            errs.append(f"sections[{i}]: starts at {s.get('a')}, expected {expect}")
        if not isinstance(s.get("b"), int) or s["b"] < s.get("a", 0):
            errs.append(f"sections[{i}]: bad end {s.get('b')}")
            break
        expect = s["b"] + 1
        V.check_title(errs, warns, f"sections[{i}].title", s.get("title"))
    if expect != N + 1:
        errs.append(f"sections end at {expect - 1}, surah has {N} ayat")
    V.check_section_sizes(errs, warns, secs, N)
    starts = {s.get("a") for s in secs}
    ends = {s.get("b") for s in secs}
    chunks = plan.get("chunks") or []
    if not chunks:
        errs.append("chunks: none")
    expect = 1
    for i, ch in enumerate(chunks):
        if not (isinstance(ch, list) and len(ch) == 2 and all(isinstance(x, int) for x in ch) and ch[0] <= ch[1]):
            errs.append(f"chunks[{i}]: must be [first ayah, last ayah]")
            break
        a, b = ch
        if a != expect:
            errs.append(f"chunks[{i}]: starts at {a}, expected {expect}")
        if a not in starts or b not in ends:
            errs.append(f"chunks[{i}] {a}–{b}: must start and end on section boundaries")
        inside = [s for s in secs if isinstance(s.get("a"), int) and a <= s["a"] and s.get("b", 0) <= b]
        if b - a + 1 > 70 and len(inside) > 1:
            errs.append(f"chunks[{i}] {a}–{b}: {b - a + 1} ayat; keep chunks to 70 ayat or fewer")
        elif b - a + 1 > 60:
            warns.append(f"chunks[{i}] {a}–{b}: {b - a + 1} ayat (aim 40–60)")
        expect = b + 1
    if chunks and expect != N + 1:
        errs.append(f"chunks end at {expect - 1}, surah has {N} ayat")
    return errs, warns


def chunk_issues(n, a, b):
    plan, err = load(plan_path(n))
    if err:
        return [err], []
    c, err = load(chunk_path(n, a, b))
    if err:
        return [err], []
    errs, warns = [], []
    if (c.get("n"), c.get("a"), c.get("b")) != (n, a, b):
        errs.append(f"n, a, b should be {n}, {a}, {b}")
    planned = [s for s in plan["sections"] if a <= s["a"] and s["b"] <= b]
    secs = c.get("sections") or []
    if len(secs) != len(planned):
        errs.append(f"{len(secs)} sections; the plan has {len(planned)} in ayat {a}–{b}")
    for i, (s, p) in enumerate(zip(secs, planned)):
        if (s.get("a"), s.get("b")) != (p["a"], p["b"]):
            errs.append(f"sections[{i}]: covers {s.get('a')}–{s.get('b')}, the plan says {p['a']}–{p['b']}")
        if s.get("title") != p["title"]:
            errs.append(f"sections[{i}].title must match the plan exactly: “{p['title']}”")
    V.check_sections(errs, warns, secs, a, b)
    V.check_groups(errs, warns, c.get("groups") or [], secs, a, b)
    V.check_ayat(errs, warns, c.get("ayat") or {}, a, b)
    return errs, warns


# ---------- merge ----------

def merge(n, out=None, plan_dir=None, chunk_dir=None):
    plan, err = load(os.path.join(plan_dir, f"s{n:03d}.json") if plan_dir else plan_path(n))
    if err:
        sys.exit(err)
    sections, groups, ayat = [], [], {}
    for a, b in plan["chunks"]:
        c, err = load(os.path.join(chunk_dir, f"s{n:03d}-{a}-{b}.json") if chunk_dir else chunk_path(n, a, b))
        if err:
            sys.exit(f"{err}: write that chunk first")
        sections += c["sections"]
        groups += c["groups"]
        ayat.update(c["ayat"])
    N = meta(n)["ayat"]
    merged = {"n": n, "sub": plan["sub"], "theme": plan["theme"], "story": plan["story"],
              "sections": sections, "groups": groups,
              "ayat": {str(k): ayat[str(k)] for k in range(1, N + 1) if str(k) in ayat}}
    path = out or os.path.join(CONTENT, f"s{n:03d}.json")
    json.dump(merged, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {path}")
    return merged


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd, n = sys.argv[1], int(sys.argv[2])
    if cmd == "plan-brief":
        plan_brief(n)
    elif cmd == "check-plan":
        sys.exit(1 if V.report(f"plan s{n:03d}", *plan_issues(n)) else 0)
    elif cmd == "chunk-briefs":
        plan, err = load(plan_path(n))
        if err:
            sys.exit(err)
        errs, _ = plan_issues(n, plan)
        if errs:
            sys.exit("fix the plan first: python3 long_surah.py check-plan %d" % n)
        for a, b in plan["chunks"]:
            chunk_brief(n, a, b, plan)
    elif cmd == "check-chunk":
        a, b = int(sys.argv[3]), int(sys.argv[4])
        sys.exit(1 if V.report(f"chunk s{n:03d} {a}–{b}", *chunk_issues(n, a, b)) else 0)
    elif cmd == "merge":
        plan, err = load(plan_path(n))
        if err:
            sys.exit(err)
        bad = [f"{a}–{b}" for a, b in plan["chunks"] if chunk_issues(n, a, b)[0]]
        if bad:
            sys.exit("these chunks still have errors: " + ", ".join(bad))
        merge(n)
        sys.exit(1 if V.report(f"s{n:03d}", *V.check(n)) else 0)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
