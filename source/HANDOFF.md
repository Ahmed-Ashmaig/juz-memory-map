# QuranFlow — handoff for the next session

Read this first when resuming. It says where things stand, what is half-done, and exactly what to do next.
Last updated: 2026-09-15.

## Where everything is

| What | Where |
|---|---|
| Repo | `~/juz-memory-map` → https://github.com/Ahmed-Ashmaig/juz-memory-map (commits must be authored as Ahmed-Ashmaig; the repo-local git identity is already set) |
| Live app | https://ahmed-ashmaig.github.io/juz-memory-map/ (GitHub Pages, deploys on push to `main`) |
| Link to send people | https://ahmed-ashmaig.github.io/juz-memory-map/install.html |
| Private claude.ai copy | https://claude.ai/code/artifact/376dcf0a-1a04-457d-ba8b-5794d1849146 — republish from `source/site` with `root` = that folder and a `files` map (`app.js`, `data/index.js`, `data/sNNN.js`) after every change |
| Pipeline docs | `source/README.md` (the build), `source/STYLE.md` (content rules), `source/LONG_SURAHS.md` (surahs over 110 ayat) |
| Browser tests | `source/tests/` (see "Testing") |

## State right now

- **Live:** 74 surahs, 41–114 (Juz 25–30), app named QuranFlow.
- **Pipeline built on 2026-09-15** (tested, pushed with this note):
  - `long_surah.py` + `LONG_SURAHS.md`: long surahs are written as a plan (surah fields, every section's range and
    title, chunk ranges), then chunks in parallel from sliced briefs, then a merge. Tested: every tafsir passage of
    Az-Zumar's brief lands in the right chunk brief; a split-and-merge of Al-Wāqiʿah rebuilds it exactly; title,
    group and ayah drift is caught.
  - `validate_content.py` refactored into reusable checks (identical results on all 74 surahs) with long-surah
    section rules (3–40 ayat per section, no 8-section cap above 110 ayat).
  - `coverage.py` holds `FIRST` (the first surah covered) for build_site, similars, similars_brief, fetch_similar_tr.
  - `fetch_all.py`: pages up to 600 continuation pages (was 60, which would truncate long surahs), keeps every
    revelation-report excerpt and saves the Qurtubi rows in tafsir.json.
  - Home list: a juz that starts partway through a surah opens with a "Continues <surah> · from ayah N" row
    (links like `#51/ayah/31`), so Juz 2 and 5 (inside Al-Baqarah and An-Nisāʾ) will show.
  - Offline: only the app shell is precached; each surah is cached the first time it is opened.
- **In progress (NOT committed, excluded from commits until reviewed):**
  - Juz 24 pilot writers: `content/s039.json` (Az-Zumar, on **Fable**) and `content/s040.json` (Ghāfir, on
    **Opus**), restarted on 2026-09-15 after the session limit stopped the first attempt. If either file is missing
    or fails `python3 validate_content.py NN`, re-run that writer (prompt pattern below).
  - `fetch_all.py 38 37 … 1` downloading in the background. When it ends, check its output for `FAILED` or
    `WARNING`; re-run `python3 fetch_all.py NN` for any failed surah (finished surahs are skipped).

## Next steps (in order)

1. **Review the pilot.** For 39 and 40: `python3 validate_content.py NN`; read the section titles; spot-check 5–10
   ayah notes and every `why` against `raw/sNNN/brief.md` (nothing from memory, no scholar names, "reportedly" where
   reports differ). Compare the two writers' token use and quality; tell Ahmed which model to use for the rest.
2. **Integrate Juz 24:** `FIRST = 39` in `coverage.py`; add to `raw/juz.json`
   `"24": {"pages":[462,481],"surahs":[39,40,41],"start":"39:32","end":"41:46"}`; run `similars.py`,
   `fetch_similar_tr.py`, `similars_brief.py 39 40`; write `content/similars/s039.json`/`s040.json` per
   SIMILARS_STYLE.md and validate; build, render check, browser tests, commit, push, republish the claude.ai copy.
3. **STYLE.md:** add one line pointing surahs over 110 ayat to LONG_SURAHS.md (held back while the pilot writers
   were reading STYLE.md).
4. **Juz 23 down to Juz 1**, one juz at a time, pushing after each passes: juz.json entry (start/end from
   `fetch_quran_metadata`, recorded below), `FIRST` lowered, writers in parallel (long surahs through
   long_surah.py), validate, similars, build, tests, commit, push, republish.

Juz boundaries (from quran-mcp): 1 1:1–2:141 · 2 2:142–2:252 · 3 2:253–3:92 · 4 3:93–4:23 · 5 4:24–4:147 ·
6 4:148–5:81 · 7 5:82–6:110 · 8 6:111–7:87 · 9 7:88–8:40 · 10 8:41–9:92 · 11 9:93–11:5 · 12 11:6–12:52 ·
13 12:53–14:52 · 14 15:1–16:128 · 15 17:1–18:74 · 16 18:75–20:135 · 17 21:1–22:78 · 18 23:1–25:20 ·
19 25:21–27:55 · 20 27:56–29:45 · 21 29:46–33:30 · 22 33:31–36:27 · 23 36:28–39:31 · 24 39:32–41:46.
(Take page ranges from the layout at build time; build_site.py does this when `start`/`end` are given.)

## Size of the remaining work (measured from Juz 25–27)

- Juz 25–27 actuals: 17 surahs, 886 ayat, 3.81M writer tokens (+0.37M for look-alike cues) → ~224k tokens per
  surah, ~4.3k per ayah; briefs average ~5k characters per ayah.
- Remaining Juz 1–24: surahs 1–40, 4,218 ayat (68% of the Quran), ~73 writer jobs once long surahs are chunked;
  projected 16–18M writer tokens at the Juz 25–27 rate (Madinan legal surahs likely at the upper end).

## Writer prompt (pattern used for every surah up to 110 ayat)

Read `STYLE.md` in full, read `content/s070.json` (gold example), read `raw/sNNN/brief.md` in chunks, write
`content/sNNN.json`, run `python3 validate_content.py NN` until OK. Only edit that one file; no build, deploy or
git. Only the brief is a source; no Arabic script; no scholar names; titles 7–12 words; hooks describe patterns in
the text. Add surah-specific notes (juz boundaries, long narratives, sensitive rulings). For long surahs follow
LONG_SURAHS.md instead (a planner, then one writer per chunk).

## Testing

- Serve the repo root: `cd ~/juz-memory-map && python3 -m http.server 8767`, then open (or headless-Chrome
  `--dump-dom`) `http://127.0.0.1:8767/source/tests/<page>.html`; each page prints results into `<pre id="out">`.
  - `fit-test.html`: five phone sizes; screen 2 (section row, whole page, page bar, bar clear) and screen 3.
  - `snap-test.html`: phone scroller, snap points, bar hidden on the intro screen, bar order, desktop grid.
  - `flow-test.html`: Learn tabs, weak spots, the full drill, home summary links.
  - `strip-test.html`: horizontal section row follows the pages; desktop layout.
  - `tap-test.html`: word taps follow the open tab; rows start closed; splash; page-flip overlay.
  - `home-test.html`: juz blocks in order, "continues" rows, and that they open the right ayah.
- Headless Chrome hangs on exit but still writes output: `perl -e 'alarm 120; exec @ARGV' "/Applications/Google
  Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --user-data-dir=/tmp/qf-prof
  --virtual-time-budget=60000 --dump-dom URL`. Headless does not fire scroll events on its own; tests dispatch them.
- `python3 source/check_render.py [NN ...]` opens surahs in headless Chrome and reports any that fail to render.
- zsh does not word-split `$VAR`; pass lists as `$(seq 41 114)` or `${=VAR}`.

## Resuming the conversation

Run `claude --continue` inside `~/juz-memory-map` (or `claude --resume` and pick this session) to get the chat
history back; the memory files load automatically.
