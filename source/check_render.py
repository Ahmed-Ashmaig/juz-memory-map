"""Open each ready surah (or the ones given) in headless Chrome and report any that fail to render."""
import json, os, subprocess, sys
site = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
body = open(f"{site}/index.html", encoding="utf-8").read()
open(f"{site}/preview.html", "w", encoding="utf-8").write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + body + '</body></html>')
ready = json.loads(open(f"{site}/data/index.js").read().split("=", 1)[1].rstrip().rstrip(";"))["ready"]
targets = [int(x) for x in sys.argv[1:]] or ready
chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fails = []
for n in targets:
    r = subprocess.run([chrome, "--headless=new", "--disable-gpu", "--enable-logging=stderr", "--v=0", "--virtual-time-budget=6000", "--dump-dom", f"file://{site}/preview.html#{n}"], capture_output=True, text=True, timeout=90)
    if not ('id="loading" hidden' in r.stdout and 'class="blk' in r.stdout):
        fails.append((n, [l for l in r.stderr.splitlines() if "Uncaught" in l][:1]))
print(f"checked {len(targets)} surahs; failures: {fails or 'none'}")
sys.exit(1 if fails else 0)
