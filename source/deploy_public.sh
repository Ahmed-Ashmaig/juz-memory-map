#!/bin/zsh
# Rebuild from validated content and push the public app (GitHub Pages redeploys on push).
set -e
cd "$(dirname "$0")"
python3 build_site.py
python3 build_pwa.py
cd ..
git add -A
if git diff --cached --quiet; then
  echo "nothing new to deploy"
  exit 0
fi
READY=$(python3 -c "import json;print(len(json.loads(open('data/index.js').read().split('=',1)[1].rstrip().rstrip(';'))['ready']))")
git commit -q -m "Add surahs: ${READY} of 57 ready

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -q origin main
echo "pushed: ${READY} surahs ready"
