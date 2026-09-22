#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$APP_ROOT/.picture-flashcards.local.env"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Update failed: no saved installation was found." >&2
  echo "Run ./install.sh first." >&2
  exit 1
fi

cd "$APP_ROOT"

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Downloading the latest app code..."
  git pull --ff-only
else
  echo "No Git checkout detected; updating the dependencies and build from the current files."
fi

exec "$APP_ROOT/install.sh" --use-saved-config