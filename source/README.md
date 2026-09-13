# Source for the Juz 25–30 Memory Map

Everything needed to rebuild the app at the repo root. The raw tafsir downloads are not included
(they are copyrighted). `fetch_all.py` can download them again from quran-mcp if content needs rewriting.

The app covers surahs 41–114. Fuṣṣilat (41) starts in Juz 24, but it is included whole because the app works in whole surahs.

| Path | What it is |
|---|---|
| `content/sNNN.json` | Sections, meanings, deeper explanations and per-ayah notes for each surah |
| `STYLE.md` | The rules those files follow (sources, tone, JSON shape) |
| `validate_content.py` | Checks a content file: every ayah covered, no Arabic typed by hand, no source names |
| `raw/pages/`, `raw/sNNN/{meta,tr}.json` | Muṣḥaf page layout, translation and metadata from quran-mcp |
| `raw/juz.json` | Pages and surahs for each juz. A juz that starts or ends mid-surah also gives its `start`/`end` ayah |
| `repeats.py` | Finds ayat repeated within a surah (exact and near repeats) |
| `similars.py`, `fetch_quran_pages.py`, `fetch_similar_tr.py`, `similars_brief.py` | Find look-alike ayat across the whole Quran and write a brief for each surah (`raw/similars/`) |
| `content/similars/sNNN.json`, `SIMILARS_STYLE.md`, `validate_similars.py` | The order cues shown in the Similars tab, their rules and their checker |
| `site/index.html`, `site/src/*.js` | The app itself (page + engine) |
| `build_site.py` | Builds `site/app.js` and `site/data/` from content + raw data |
| `build_pwa.py` | Builds the installable app into the repo root (manifest, service worker, fonts, icons, README) |
| `deploy_public.sh` | Runs both builds, commits and pushes (GitHub Pages redeploys) |
| `check_render.py` | Opens every surah in headless Chrome and reports any that fail to render |
| `dev_watch.py` | Rebuilds whenever content, app code or build scripts change |

## Common tasks

**Preview locally.** Run a live-reload server on the repo root and the watcher side by side:

```
npx live-server .. --port=8765 --no-browser --ignore=source
python3 dev_watch.py
```

**Rewrite a surah.** Run `python3 fetch_all.py NNN` to download its tafsir into `raw/` (ignored by git). Edit
`content/sNNN.json` following `STYLE.md`, run `python3 validate_content.py NNN`, then deploy.

**Add more surahs** (this is how Juz 25–27 were added):

1. Lower the first surah number: `FIRST` in `build_site.py` and `similars.py`, and the `range(…, 115)` loops in
   `similars_brief.py` and `fetch_similar_tr.py`.
2. Add the new juz to `raw/juz.json`. Include `start`/`end` ayah keys when the juz begins or ends mid-surah.
3. `python3 fetch_all.py NNN NNN …` downloads the metadata, translation, tafsir and page layout, and writes `raw/sNNN/brief.md`.
4. Write `content/sNNN.json` for each surah from its brief, following `STYLE.md` (one writer per surah works well in parallel), and validate each one.
5. Run `similars.py`, then `fetch_similar_tr.py`, then `similars_brief.py NNN …`. Write `content/similars/sNNN.json` from each brief following `SIMILARS_STYLE.md`, and validate it.
6. Run `python3 check_render.py`, then `./deploy_public.sh`.

**Publish:** `./deploy_public.sh`
