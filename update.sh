#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  echo "Update failed: $*" >&2
  exit 1
}

cd "$APP_ROOT"
command -v git >/dev/null 2>&1 || fail "Git is required to update this checkout."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || fail "This directory is not a Git checkout; configure an upstream before updating."

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  git status --short >&2
  fail "The working tree has local changes. Commit or safely back them up before updating."
fi

git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1 \
  || fail "No upstream is configured. Set it explicitly with: git branch --set-upstream-to=REMOTE/BRANCH"

echo "Fetching configured Git remotes..."
timeout 600 git fetch || fail "Git fetch failed; the application was not stopped."
echo "Pulling configured upstream changes (fast-forward only)..."
timeout 600 git pull --ff-only --no-rebase || fail "Git pull failed; the application was not stopped."

[[ -f "$APP_ROOT/.picture-flashcards.local.env" || -f /var/lib/picture-flashcards/picture-flashcards.env ]] \
  || fail "No saved installation was found. Run ./install.sh first."

echo "Stopping the application before rebuilding..."
"$APP_ROOT/stop.sh"
echo "Installing locked dependencies and rebuilding production assets..."
"$APP_ROOT/install.sh" --use-saved-config --restart-owned --no-start
echo "Update complete. The service remains stopped; run ./start.sh when ready."