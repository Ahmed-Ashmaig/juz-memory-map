# QuranFlow — handoff for the next session

Read this first when resuming. It says where things stand, what is half-done, and exactly what to do next.
Last updated: 2026-09-15, 14:15.

## Where everything is

| What | Where |
|---|---|
| Repo | `~/juz-memory-map` → https://github.com/Ahmed-Ashmaig/juz-memory-map (commits must be authored as Ahmed-Ashmaig; the repo-local git identity is already set) |
| Live app | https://ahmed-ashmaig.github.io/juz-memory-map/ (GitHub Pages, deploys on push to `main`) |
| Link to send people | https://ahmed-ashmaig.github.io/juz-memory-map/install.html |
| Private claude.ai copy | https://claude.ai/code/artifact/376dcf0a-1a04-457d-ba8b-5794d1849146 — republish from `source/site` with `root` = that folder and a `files` map (`app.js`, `data/index.js`, `data/sNNN.js`) after every change |
| Pipeline docs | `source/README.md` (the build), `source/STYLE.md` (content rules), `source/LONG_SURAHS.md` (surahs over 110 ayat), `source/WRITER_PROMPTS.md` (the exact agent prompts) |
| Browser tests | `source/tests/` (see "Testing") |
| Writer agent | `quranflow-writer` (Opus, effort xhigh) in `~/.claude/agents/quranflow-writer.md`, with a copy in `~/juz-memory-map/.claude/agents/`. It only loads in a session started after the file existed (added 14:06 on 2026-09-15). Delete the `~/.claude` copy once Juz 1 is done. |

## State right now

- **Live:** 76 surahs, 39–114 (Juz 24–30). Juz 24 (Az-Zumar, Ghāfir and their look-alike cues) was pushed on
  2026-09-15 after validation, a review of every revelation report against the briefs, the render check of all
  76 surahs and the six browser tests.
- **Pipeline** (pushed 2026-09-15):
  - `long_surah.py` + `LONG_SURAHS.md`: a long surah is written as a plan (surah fields, every section's range and
    title, chunk ranges), then chunks in parallel from sliced briefs, then a merge. Tested on Az-Zumar's brief
    (every tafsir passage lands in the right chunk brief) and Al-Wāqiʿah (split and merge rebuilds it exactly).
  - `validate_content.py`: reusable checks, with long-surah section rules (3–40 ayat per section above 110 ayat).
  - `coverage.py` holds `FIRST` (the first surah covered) for build_site, similars, similars_brief, fetch_similar_tr.
  - `fetch_all.py` pages up to 600 continuation pages and keeps every revelation-report excerpt.
  - Home list: a juz that starts partway through a surah opens with a "Continues <surah> · from ayah N" row.
  - Offline: only the app shell is precached; each surah is cached the first time it's opened.
- **Downloads:** `fetch_all.py 38 37 … 1` is running in the background (38→14 finished by 14:05, no failures).
  When resuming, list which `raw/sNNN/brief.md` exist for 1–38 and re-run `python3 fetch_all.py NN` for each
  missing one (finished surahs are skipped).
- **Juz 23 prep:** `raw/s037/brief-plan.md` exists for As-Ṣāffāt (182 ayat; 40k characters against 511k for the
  full brief). Brief sizes: Yā-Sīn 388k, Ṣād 377k.

## Which model writes what (decided 2026-09-15 from the Juz 24 pilot)

Measured from the writers' own transcripts (cache writes, cache reads and output, at API list prices):

| Run | Model · effort | Ayat | Cost | Per ayah | Time |
|---|---|---|---|---|---|
| Az-Zumar pilot | Fable 5.1 · max | 75 | $18.5 | $0.25 | 21 min |
| Ghāfir pilot | Opus 5 · max | 85 | $15.1 | $0.18 | 39 min |
| Juz 25–27 writers | Opus 5 · xhigh | 17 surahs | | ≈ $0.09 | 9–21 min each |

- Both pilots were valid and grounded: every revelation report traced to the brief, and neither added one that
  wasn't there. Fable was faster and a little more polished, not more correct. Per token it costs twice Opus, but
  it reads cached context at half Opus's rate, so at the same effort it came out ~1.4× Opus per ayah.
- Max effort (the session setting since the evening of 2026-09-13) doubled Opus's thinking and cost against the
  xhigh runs of Juz 25–27, with no visible gain.
- **Decision:** surah writers, chunk writers and cue writers on Opus at xhigh; the 16 long-surah plans on Fable
  (small briefs, and the plan fixes every section and title the chunk writers must follow). A `general-purpose`
  agent inherits the session's effort, so writers run at max until the session uses `/effort xhigh` or a new
  session loads the `quranflow-writer` agent.
- Writers write long JSON in passes: a step that runs past ~5 minutes lets the prompt cache expire, and the whole
  context is written again (the Ghāfir pilot re-wrote 1.36M tokens this way).
- A surah of 110 ayat or fewer whose brief is over ~500k characters (Al-Kahf: 680k) also goes through
  long_surah.py, with a plan of up to 8 sections and two chunks.

## Next steps (in order)

1. **Juz 23** (36:28–39:31; Yā-Sīn 36 with 83 ayat, As-Ṣāffāt 37 with 182, Ṣād 38 with 88): writers for 36 and 38;
   for 37 the Fable plan → `check-plan` → `chunk-briefs` → one Opus writer per chunk → `merge`. Review every `why`
   against the brief. Then add `"23"` to `raw/juz.json` (`start` 36:28, `end` 39:31, surahs 36–38), set
   `FIRST = 36`, run `similars.py` → `fetch_similar_tr.py` → `similars_brief.py 36 37 38` → one cue writer →
   `validate_similars.py 36 37 38`; build, `check_render.py`, the six browser tests; commit as Ahmed Ashmaig, push,
   check the live site, republish the claude.ai copy, update this note.
2. **Juz 22 down to Juz 1**, the same way, pushing after each juz passes.

Juz boundaries (from quran-mcp): 1 1:1–2:141 · 2 2:142–2:252 · 3 2:253–3:92 · 4 3:93–4:23 · 5 4:24–4:147 ·
6 4:148–5:81 · 7 5:82–6:110 · 8 6:111–7:87 · 9 7:88–8:40 · 10 8:41–9:92 · 11 9:93–11:5 · 12 11:6–12:52 ·
13 12:53–14:52 · 14 15:1–16:128 · 15 17:1–18:74 · 16 18:75–20:135 · 17 21:1–22:78 · 18 23:1–25:20 ·
19 25:21–27:55 · 20 27:56–29:45 · 21 29:46–33:30 · 22 33:31–36:27 · 23 36:28–39:31 · 24 39:32–41:46.
(Juz 24's entry also lists `pages`; copy its shape.)

## Size of the remaining work

- Surahs 1–38: 4,058 ayat, about 70 writer jobs once long surahs are chunked.
- At the Opus xhigh rate (≈ $0.09 per ayah at API prices) that is roughly $370 of usage plus plans and cues; at max
  effort about twice that.

## Testing

- Serve the repo root: `cd ~/juz-memory-map && python3 -m http.server 8767`, then open (or headless-Chrome
  `--dump-dom`) `http://127.0.0.1:8767/source/tests/<page>.html`; each page prints results into `<pre id="out">`.
  The six pages can run in parallel, each with its own `--user-data-dir`.
  - `fit-test.html`: five phone sizes; screen 2 (section row, whole page, page bar, bar clear) and screen 3.
  - `snap-test.html`: phone scroller, snap points, bar hidden on the intro screen, bar order, desktop grid.
  - `flow-test.html`: Learn tabs, weak spots, the full drill, home summary links.
  - `strip-test.html`: horizontal section row follows the pages; desktop layout.
  - `tap-test.html`: word taps follow the open tab; rows start closed; splash; page-flip overlay.
  - `home-test.html`: juz blocks in order, "continues" rows, and that they open the right ayah.
  - Known headless quirks, not bugs: "splash hidden after load? false" (tap) and "in view false" (strip).
- Headless Chrome hangs on exit but still writes output: `perl -e 'alarm 150; exec @ARGV' "/Applications/Google
  Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --user-data-dir=/tmp/qf-prof
  --virtual-time-budget=60000 --dump-dom URL`. Headless does not fire scroll events on its own; tests dispatch them.
- `python3 source/check_render.py [NN ...]` opens surahs in headless Chrome and reports any that fail to render.
- zsh does not word-split `$VAR`; pass lists as `$(seq 41 114)` or `${=VAR}`.

## Resuming the conversation

This conversation and its memory files belong to the home folder, so resume from there: reopen Claude Code on the
home folder and pick this session from the history, or run `claude --continue` in `~`. A session started inside
`~/juz-memory-map` starts fresh and doesn't see the memory files; point it at this note.
