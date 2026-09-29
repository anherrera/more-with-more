#!/usr/bin/env bash
# Publish: push main to GitHub, which runs the tests in CI and then redeploys the public Pages site.
# Only when the user says the localhost version is ready.
set -euo pipefail
cd "$(dirname "$0")/.."
git push -q
echo "pushed $(git log --oneline -1); CI tests, then GitHub Pages deploys"
