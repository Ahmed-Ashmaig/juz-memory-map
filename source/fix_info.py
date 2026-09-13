"""Backfill the quran.com surah introduction into briefs whose first fetch got a 403."""
import html
import json
import os
import re
import time
import urllib.request

SP = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def strip_html(t):
    t = re.sub(r"<h[1-4][^>]*>(.*?)</h[1-4]>", r"\n### \1\n", t, flags=re.S)
    t = re.sub(r"</p>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", t)).strip()


for d in sorted(os.listdir(os.path.join(SP, "raw"))):
    if not re.match(r"s\d{3}$", d) or not os.path.exists(os.path.join(SP, "raw", d, "done")):
        continue
    bf = os.path.join(SP, "raw", d, "brief.md")
    b = open(bf).read()
    if "## Surah introduction" in b:
        continue
    n = int(d[1:])
    req = urllib.request.Request(f"https://api.quran.com/api/v4/chapters/{n}/info?language=en", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            info = json.loads(r.read().decode())["chapter_info"]
    except Exception as e:
        print(d, "failed", e)
        continue
    block = f"\n## Surah introduction ({info.get('source')})\n{strip_html(info.get('text', ''))}\n"
    marker = "\n## Tafsir Ibn Kathir (English)"
    b = b.replace(marker, block + marker, 1) if marker in b else b + block
    open(bf, "w").write(b)
    print(d, "intro added", len(block))
    time.sleep(0.4)
