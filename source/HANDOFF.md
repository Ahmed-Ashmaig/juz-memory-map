# QuranFlow — handoff for the next session

Read this first when resuming. It says where things stand, what is half-done, and exactly what to do next.
Last updated: 2026-09-13, after commit `dc53b2c`.

## Where everything is

| What | Where |
|---|---|
| Repo | `~/juz-memory-map` → https://github.com/Ahmed-Ashmaig/juz-memory-map (commits must be authored as Ahmed-Ashmaig; the repo-local git identity is already set) |
| Live app | https://ahmed-ashmaig.github.io/juz-memory-map/ (GitHub Pages, deploys on push to `main`) |
| Link to send people | https://ahmed-ashmaig.github.io/juz-memory-map/install.html |
| Private claude.ai copy | https://claude.ai/code/artifact/376dcf0a-1a04-457d-ba8b-5794d1849146 — republish from `source/site` with `root` = that folder and a `files` map (`app.js`, `data/index.js`, `data/sNNN.js`) after every change |
| Pipeline docs | `source/README.md` (how the build works, how surahs were added) |
| Browser tests | `source/tests/` (see "Testing" below) |

## State right now

- **Live:** 74 surahs, 41–114 (Juz 25–30), app named QuranFlow.
- **UI (all pushed):** Learn has Ayah / Section / Weak spots tabs; a bar pinned to the bottom (‹ Next on the left, Previous › on the right, muṣḥaf order) steps by ayah, section or drill step; phones snap between three screens (intro, section row + page, tabs) and every screen fits between the top bar and the bottom bar (checked at five phone sizes); weak-spot drill (5 passes in a row clears a spot); splash with the basmala; install page.
- **In progress — Juz 24 pilot (NOT committed):**
  - Downloaded: `source/raw/s039/`, `source/raw/s040/`, `source/raw/pages/p458–p476.json`.
  - Two writer agents were writing `source/content/s039.json` (Az-Zumar, run on **Fable**) and `source/content/s040.json` (Ghāfir, run on **Opus**) to compare cost and quality. If a file is missing or fails `python3 validate_content.py NN`, re-run the writer for that surah (prompt pattern: see "Writer prompt" below).
  - Commits since the pilot started deliberately exclude these paths. Keep doing that until the pilot passes review.

## Next steps (in order)

1. **Review the pilot.** For each of 39 and 40: `python3 validate_content.py NN`; read the sections/titles; spot-check 5–10 ayat notes and every `why` against `raw/sNNN/brief.md` (nothing from memory, no scholar names, "reportedly" where reports differ). Compare the two models' token use and quality and report to Ahmed.
2. **Integrate Juz 24:**
   - `FIRST = 39` in `build_site.py` and `similars.py`; `range(39, 115)` in `similars_brief.py` and `fetch_similar_tr.py`.
   - Add Juz 24 to `raw/juz.json`: `{"pages":[462,481],"surahs":[39,40,41],"start":"39:32","end":"41:46"}` (41 will then list under Juz 24, which is correct: Fuṣṣilat starts there).
   - `python3 similars.py && python3 fetch_similar_tr.py && python3 similars_brief.py 39 40`, then write `content/similars/s039.json` / `s040.json` per `SIMILARS_STYLE.md` and validate.
   - Build, `python3 check_render.py`, run the browser tests, commit, push, republish the claude.ai copy.
3. **Before the full Juz 1–23 run**, fix what does not scale yet:
   - **Long surahs** (2, 3, 4, 5, 6, 7, 9, 11, 12, 16, 17, 20, 21, 23, 26, 37) have briefs too big for one writer. Split each into ~60-ayah chunks on section/ruku boundaries (brief per chunk), one writer per chunk, then a merge step that joins sections/groups/ayat and re-validates.
   - **STYLE.md** caps sections at 8; long surahs need ruku-sized sections (roughly 8–20 ayat each).
   - **Home list:** a juz that lies entirely inside one surah (e.g. Juz 2 and 5) currently would not show; add "continues <surah>, ayat a–b" rows that open the surah at that ayah.
   - **Offline cache:** `build_pwa.py` precaches every surah file at install; switch surah data to cache-on-open before adding ~40 more files.
4. **Full run**, juz by juz, pushing after each juz passes: fetch → chunk briefs → writers (parallel) → validate → similars → build → render check + browser tests → commit/push → republish twin.

## Size of the remaining work (measured from Juz 25–27)

- Juz 25–27 actuals: 17 surahs, 886 ayat, 3.81M writer tokens (+0.37M for look-alike cues) → ~224k tokens per surah, ~4.3k per ayah; briefs average ~5k characters per ayah.
- Remaining Juz 1–24: surahs 1–40, 4,218 ayat (68% of the Quran), ~73 writer jobs once long surahs are chunked; projected 16–18M writer tokens at the Juz 25–27 rate (Madinan legal surahs likely at the upper end).

## Writer prompt (pattern used for every surah)

Read `STYLE.md` in full, read `content/s070.json` (gold example), read `raw/sNNN/brief.md` in chunks, write `content/sNNN.json`, run `python3 validate_content.py NN` until OK. Only edit that one file; no build, deploy or git. Only the brief is a source; no Arabic script; no scholar names; titles 7–12 words; hooks describe patterns in the text. Add surah-specific notes (juz boundaries, long narratives, sensitive rulings).

## Testing

- Build output is served from the repo root: `cd ~/juz-memory-map && python3 -m http.server 8767`, then open (or headless-Chrome `--dump-dom`) `http://127.0.0.1:8767/source/tests/<page>.html`. Each page prints its results into `<pre id="out">`.
  - `fit-test.html` — five phone sizes: screen 2 (section row, whole page, page bar, bar clear) and screen 3 (tabs, before, this, after).
  - `snap-test.html` — phone scroller, snap points, bar hidden on the intro screen, bar order, desktop grid.
  - `flow-test.html` — Learn tabs, weak-spot marking, the full drill (mistake reset, five passes, auto-clear, "recite the whole surah"), home summary links.
  - `strip-test.html` — horizontal section row follows the pages; desktop layout.
  - `tap-test.html` — word taps follow the open tab; rows start closed; splash text; page-flip overlay.
- Headless Chrome hangs on exit but still writes output: wrap it as `perl -e 'alarm 120; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --user-data-dir=/tmp/qf-prof --virtual-time-budget=60000 --dump-dom URL`. Headless does not fire scroll events on its own; the tests dispatch them.
- `python3 source/check_render.py [NN ...]` opens surahs in headless Chrome and reports any that fail to render.

## Resuming the conversation

Run `claude --continue` inside `~/juz-memory-map` (or `claude --resume` and pick this session) to get the chat history back; the memory files load automatically.
