# Source for the Juz 28–30 Memory Map

Everything needed to rebuild the app at the repo root. The raw tafsir downloads are not included
(they are copyrighted); `fetch_all.py` can download them again from quran-mcp if content needs rewriting.

| Path | What it is |
|---|---|
| `content/sNNN.json` | Sections, meanings, deeper explanations and per-ayah notes for each surah |
| `STYLE.md` | The rules those files follow (sources, tone, JSON shape) |
| `validate_content.py` | Checks a content file: every ayah covered, no Arabic typed by hand, no source names |
| `raw/pages/`, `raw/sNNN/{meta,tr}.json`, `raw/juz.json` | Muṣḥaf page layout, translation and metadata from quran-mcp |
| `repeats.py` | Finds ayat repeated within a surah (exact and near repeats) |
| `site/index.html`, `site/src/*.js` | The app itself (page + engine) |
| `build_site.py` | Builds `site/app.js` and `site/data/` from content + raw data |
| `build_pwa.py` | Builds the installable app into the repo root (manifest, service worker, fonts, icons) |
| `deploy_public.sh` | Runs both builds, commits and pushes (GitHub Pages redeploys) |
| `check_render.py` | Opens every surah in headless Chrome and reports any that fail to render |

Rebuild and publish: `./deploy_public.sh`

To rewrite a surah: `python3 fetch_all.py NNN` (downloads tafsir into `raw/`, ignored by git),
edit `content/sNNN.json` following `STYLE.md`, run `python3 validate_content.py NNN`, then deploy.
