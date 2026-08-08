#!/usr/bin/env bash
# Deploy the built site to GitHub Pages via the gh-pages branch.
# Usage: ./scripts/deploy-gh-pages.sh <remote-url> [branch]
#   remote-url: e.g. git@github.com:USERNAME/solar-system.git
#   branch:     target branch, default gh-pages
set -euo pipefail

REMOTE="${1:?usage: ./scripts/deploy-gh-pages.sh <remote-url> [branch]}"
BRANCH="${2:-gh-pages}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE="$(mktemp -d)"

echo "==> Building production bundle (base: /solar-system/)"
cd "$ROOT"
VITE_BASE_PATH="/solar-system/" npm run build

echo "==> Preparing $BRANCH branch"
git worktree add --detach "$WORKTREE" 2>/dev/null || git worktree add "$WORKTREE"
cd "$WORKTREE"
git checkout --orphan "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
git rm -rf --quiet . 2>/dev/null || true

echo "==> Copying dist/"
cp -r "$ROOT/dist/." "$WORKTREE/"

git add -A
if git diff --cached --quiet; then
  echo "No changes to deploy."
else
  git commit -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi

echo "==> Pushing to $REMOTE"
git push -f "$REMOTE" "$BRANCH"
cd "$ROOT"
git worktree remove --force "$WORKTREE"
echo "==> Done. Site will be live at https://<user>.github.io/solar-system/"
