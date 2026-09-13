"""Local dev loop: rebuild the app whenever content, app code or build scripts change.

Pair it with a live-reload server on the repo root (see README), e.g.
  npx live-server /path/to/juz-memory-map --port=8765 --no-browser --ignore=source
Nothing is committed or pushed; run deploy_public.sh for that.
"""
import glob
import os
import subprocess
import sys
import time

SP = os.path.dirname(os.path.abspath(__file__))
WATCH = ["content/*.json", "content/similars/*.json", "site/src/*.js", "site/index.html",
         "build_site.py", "build_pwa.py", "repeats.py", "raw/similars/s*.json"]


def snapshot():
    files = {}
    for pattern in WATCH:
        for f in glob.glob(os.path.join(SP, pattern)):
            try:
                files[f] = os.stat(f).st_mtime
            except FileNotFoundError:
                pass
    return files


def build(reason):
    t = time.strftime("%H:%M:%S")
    r1 = subprocess.run([sys.executable, "build_site.py"], cwd=SP, capture_output=True, text=True)
    r2 = subprocess.run([sys.executable, "build_pwa.py"], cwd=SP, capture_output=True, text=True) if r1.returncode == 0 else None
    ok = r1.returncode == 0 and r2 is not None and r2.returncode == 0
    ready = next((l for l in r1.stdout.splitlines() if l.startswith("ready")), "")
    skipped = [l for l in r1.stdout.splitlines() if l.startswith("skipped")]
    print(f"{t} rebuilt ({reason}): {'OK' if ok else 'FAILED'} · {ready.split(':')[0]}", flush=True)
    for l in skipped:
        print("   ", l, flush=True)
    if not ok:
        print((r1.stderr or (r2.stderr if r2 else ""))[-800:], flush=True)


last = snapshot()
build("start")
while True:
    time.sleep(1.0)
    now = snapshot()
    changed = [f for f in now if last.get(f) != now[f]] + [f for f in last if f not in now]
    if changed:
        time.sleep(0.6)               # let writers finish saving
        now = snapshot()
        build(", ".join(sorted({os.path.relpath(f, SP) for f in changed})[:3]) + ("…" if len(changed) > 3 else ""))
    last = now
