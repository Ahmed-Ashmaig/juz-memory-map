# Writer prompts

The prompts given to the writer agents, so a new session can carry on with exactly the same instructions.
Fill in the `{…}` parts. Add surah-specific notes where marked: where a juz starts or ends inside the surah, long
narratives the sections should follow, and sensitive rulings to word carefully.

Models: surah writers, chunk writers and cue writers run on Opus (the `quranflow-writer` agent when it's loaded,
otherwise `general-purpose` with `model: "opus"`); long-surah plans run on Fable (`model: "fable"`). See HANDOFF.md.

## Whole surah (up to 110 ayat, brief under ~500k characters)

```
You are writing the content file for Surah {N} ({NAME}) in a Quran memorization (ḥifẓ) web app. The app already covers surahs {FIRST}–114; we are extending it to Juz {JUZ} (surahs {JUZ_SURAHS}).

Working folder: /Users/ahmedashmaig/juz-memory-map/source

Steps:
1. Read `STYLE.md` in full. It is the contract: sources, tone, section rules, JSON shape, word limits.
2. Read `content/s070.json` in full. It is the finished gold example. Match its length, voice and structure.
3. Read `raw/s{NNN}/brief.md`. It is very large (about {K}k characters of Arabic and English tafsir), so read it in chunks with offset/limit until you have covered all of it. It is your ONLY source for meaning, context and revelation reports. Never add interpretation, stories, hadith or revelation reports from memory.
4. Write `content/s{NNN}.json` following STYLE.md exactly: every ayah 1..N covered by contiguous sections, groups (1–5 ayat, never crossing a section boundary) and an `ayat` entry for every ayah. Write it in passes (the surah fields, sections and groups first, then the ayah notes in batches of about 25) so that no single step runs for more than a few minutes.
5. Run `python3 validate_content.py {N}` from the working folder. Fix every ERROR until it prints OK, and fix length warnings too.

Rules that matter most to the reader:
- Short, plain English. No citations or scholar names in the text (the validator rejects them). No Arabic script at all (transliteration with macrons and ʿ/ʾ only; ﷺ and ۞ are allowed).
- Section titles are 7–12 words and descriptive, so the titles alone show the surah's flow.
- Memory hooks describe patterns you can see in the text (repeated words, openings/closings, list order, contrasts), not claims about meaning.
- {SURAH NOTES}
- {AYAT} ayat: use up to 8 sections, and keep each `explain` tight.

Only create or edit `content/s{NNN}.json`. Do not run the build, deploy, or git, and do not edit any other file.

When done, reply with: the section list (ayah range + title), the final validator output, each ayah you gave a `why` with the brief entry it comes from (tafsir name and ayah), and one sentence on anything in the brief you found ambiguous.
```

## Long surah, step 1: the plan (Fable)

Run `python3 long_surah.py plan-brief {N}` first.

```
You are planning Surah {N} ({NAME}, {AYAT} ayat) for a Quran memorization (ḥifẓ) web app. It is a long surah, so it is written in pieces: you write the plan (the surah overview, every section's range and title, and how the sections are grouped into chunks), and other writers then write each chunk from your plan at the same time.

Working folder: /Users/ahmedashmaig/juz-memory-map/source

Steps:
1. Read `STYLE.md` in full (sources, tone, the rules for `sub`, `theme`, `story` and section titles), then `LONG_SURAHS.md` in full (sections of 8–25 ayat, chunks of 40–60 ayat).
2. Read `content/s070.json` to see the finished voice of `sub`, `theme`, `story` and the section titles.
3. Read `raw/s{NNN}/brief-plan.md` in full (about {K}k characters). It has every ayah's translation, the rukus, the passage groupings, the surah introduction and an outline of the tafsir passages. It is your ONLY source.
4. Write `content/plan/s{NNN}.json` as LONG_SURAHS.md shows. Put section boundaries where the tafsir passage ranges and the rukus agree and the theme clearly shifts.
5. Run `python3 long_surah.py check-plan {N}` until it prints OK.

Rules:
- Titles are 7–12 words and descriptive, so the titles alone tell the surah's story from start to end. The chunk writers must copy them exactly, so get them right now.
- Short, plain English. No Arabic script (transliteration with macrons and ʿ/ʾ only; ﷺ and ۞ are allowed). No scholar or source names.
- {SURAH NOTES}

Only create or edit `content/plan/s{NNN}.json`. Do not run the build, deploy, or git.

When done, reply with the section list (range + title), the chunks, the check-plan output, and one sentence on any boundary you were unsure about.
```

## Long surah, step 2: one writer per chunk (Opus)

Run `python3 long_surah.py chunk-briefs {N}` after the plan passes.

```
You are writing ayat {A}–{B} of Surah {N} ({NAME}, {AYAT} ayat) for a Quran memorization (ḥifẓ) web app. It is a long surah written in chunks from a fixed plan; other writers are writing the other chunks at the same time.

Working folder: /Users/ahmedashmaig/juz-memory-map/source

Steps:
1. Read `STYLE.md` in full, then `LONG_SURAHS.md` (step 2 is your job).
2. Read `content/s070.json` in full. It is the finished gold example. Match its length, voice and structure.
3. Read `raw/s{NNN}/brief-{A}-{B}.md` in full, in chunks with offset/limit (about {K}k characters). It starts with the plan (your sections are marked ▶), then the translation of your ayat with two ayat of context on each side, then every tafsir passage and revelation report that touches your ayat. It is your ONLY source for meaning, context and revelation reports. Never add interpretation, stories, hadith or revelation reports from memory.
4. Write `content/chunks/s{NNN}-{A}-{B}.json` as LONG_SURAHS.md shows: one full section object per ▶ section, with `a`, `b` and `title` copied exactly from the plan; groups (1–5 ayat) covering {A}..{B} that never cross a section boundary; an `ayat` entry for every ayah {A}..{B}. Write it in passes (sections and groups first, then the ayah notes in batches of about 25).
5. Run `python3 long_surah.py check-chunk {N} {A} {B}` until it prints OK.

Rules that matter most to the reader:
- Short, plain English. No citations or scholar names in the text. No Arabic script at all (transliteration with macrons and ʿ/ʾ only; ﷺ and ۞ are allowed).
- Memory hooks describe patterns you can see in the text (repeated words, openings/closings, list order, contrasts), not claims about meaning.
- {SURAH NOTES}

Only create or edit `content/chunks/s{NNN}-{A}-{B}.json`. Do not run merge, the build, deploy, or git.

When done, reply with the check-chunk output, each ayah you gave a `why` with the brief entry it comes from, anything in the plan that looked wrong for these ayat, and one sentence on anything ambiguous.
```

Then `python3 long_surah.py merge {N}`.

## Look-alike cues (Opus, one writer per juz)

Run `similars.py`, `fetch_similar_tr.py` and `similars_brief.py {N…}` first.

```
You are writing order cues for the "Similars" tab of a Quran memorization (ḥifẓ) web app, for surahs {LIST} ({NAMES}).

Working folder: /Users/ahmedashmaig/juz-memory-map/source

Steps:
1. Read `SIMILARS_STYLE.md` in full. It is the contract for these files (what to write, JSON shape, limits, sources).
2. Look at two finished examples to match voice and length: `content/similars/s077.json` with `raw/similars/brief-s077.md`, and `content/similars/s068.json` with `raw/similars/brief-s068.md`.
3. For each surah NNN in {LIST}: read `raw/similars/brief-sNNN.md` and write `content/similars/sNNN.json`, covering every group id in that brief.
4. Run `python3 validate_similars.py {LIST}` and fix every error until all pass. Also keep every flow at 70 words or fewer and every cue at 16 or fewer (the validator only fails at 1.4× those limits).

Rules:
- Your only source is each brief (the surah's `raw/sNNN/brief.md` tafsir brief may be used for context but you don't need it). Describe what the text says around each occurrence. No interpretation, stories or hadith from memory.
- Short, plain English. No Arabic script (transliteration with macrons and ʿ/ʾ only). No scholar or source names.
- Groups that already have cues in finished files for other surahs: keep the facts consistent with those, but word each file for the surah it belongs to.

Only create or edit `content/similars/sNNN.json` for {LIST}. Do not touch `content/sNNN.json`, and do not run the build, deploy, or git.

When done, reply with the validator output and one line per surah on how many groups you covered.
```
