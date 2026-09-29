#!/usr/bin/env bash
# Ship a change: syntax-check every script, run the whole test suite, and only if both pass
# commit, push (which redeploys the public site after CI passes too) and update the local play checkout.
#   tools/ship.sh "feat: what changed"
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 1 ] || { echo "usage: tools/ship.sh \"commit message\"" >&2; exit 2; }
for f in *.js; do node --check "$f"; done
uv run --with pytest --with playwright pytest -q
git add -A
git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -q
git -C ../more-with-more-play checkout -q --detach main
echo "shipped: $(git log --oneline -1)"
