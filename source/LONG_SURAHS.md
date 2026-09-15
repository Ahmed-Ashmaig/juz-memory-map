# Writing a long surah (over 110 ayat)

A long surah's brief holds the tafsir for every ayah, which is far more than one writer should read at once, so it
is written in three steps. **Everything in STYLE.md still applies** (sources, tone, no Arabic script, no source
names, the JSON shape and the word limits); this file only changes how the work is split.

The surahs this applies to: 2, 3, 4, 5, 6, 7, 9, 11, 12, 16, 17, 20, 21, 23, 26, 37.

## Sections in a long surah

- Follow the rukus and the tafsir passage groupings. A section is usually **8–25 ayat** (never fewer than 3 or
  more than 40), so a long surah has many sections: roughly one for every 12–18 ayat.
- Titles are 7–12 words and descriptive, so that the titles alone tell the surah's story from start to end.

## Step 1: the plan (one writer)

Run `python3 long_surah.py plan-brief NNN`, then read `raw/sNNN/brief-plan.md` in full. It has every ayah's
translation, the rukus, the passage groupings, the surah introduction and an outline of the tafsir passages
(ranges, headings and opening words). Write `content/plan/sNNN.json`:

```json
{
  "n": 2,
  "sub": "…",
  "theme": "…",
  "story": ["…", "…"],
  "sections": [{ "a": 1, "b": 5, "title": "…" }, { "a": 6, "b": 20, "title": "…" }],
  "chunks": [[1, 39], [40, 74]]
}
```

- `sub`, `theme` and `story` follow STYLE.md.
- `chunks` are runs of whole sections, each **40–60 ayat** (never more than 70 unless one section alone is
  bigger). Every chunk starts on a section's first ayah and ends on a section's last ayah.

Run `python3 long_surah.py check-plan NNN` until it prints OK.

## Step 2: the chunks (one writer per chunk, in parallel)

Run `python3 long_surah.py chunk-briefs NNN`. For a chunk covering ayat A–B, read `raw/sNNN/brief-A-B.md` in full.
It starts with the plan (the sections in your chunk are marked ▶), then has the translation of your ayat (plus two
ayat either side as context) and every tafsir passage and revelation report that touches them. It is your only
source. Write `content/chunks/sNNN-A-B.json`:

```json
{
  "n": 2, "a": 40, "b": 74,
  "sections": [ { "a": 40, "b": 46, "title": "copied exactly from the plan", "meaning": "…", "points": [["40–41", "…"]],
                  "matters": "…", "story": "…", "explained": ["…"], "teaches": ["…", "…"], "hook": "…" } ],
  "groups": [ { "a": 40, "b": 42, "text": "…" } ],
  "ayat": { "40": { "explain": "…" }, "41": { "explain": "…", "why": "…" } }
}
```

- One full section object per planned section inside A–B, with `a`, `b` and `title` exactly as in the plan.
- `groups` cover every ayah from A to B and never cross a section boundary; `ayat` has an entry for every ayah A..B.
- Don't change the plan. If a planned title is clearly wrong for what the tafsir says, write the best content you
  can and say so in your reply.

Run `python3 long_surah.py check-chunk NNN A B` until it prints OK.

## Step 3: merge (no writer)

`python3 long_surah.py merge NNN` checks every chunk, joins them into `content/sNNN.json` and runs the validator.
