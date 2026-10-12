#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: migrate-persistent-data.sh LEGACY_DATA_DIR PERSISTENT_DATA_DIR" >&2
  exit 2
fi

legacy="$1"
persistent="$2"
fail() { echo "Picture Flashcards: $*" >&2; exit 1; }

[[ -d "$legacy" ]] || exit 0
if ! find "$legacy" -mindepth 1 -print -quit | grep -q .; then
  exit 0
fi

verify_copy() {
  if [[ -f "$legacy/cards.json" ]]; then
    cmp -s "$legacy/cards.json" "$persistent/cards.json" \
      || fail "Migration verification failed for cards.json; both copies were preserved."
  fi
  if [[ -d "$legacy/images" ]]; then
    diff -qr "$legacy/images" "$persistent/images" >/dev/null \
      || fail "Migration verification failed for images; both copies were preserved."
  fi
}

if [[ -f "$persistent/cards.json" ]]; then
  verify_copy
else
  if [[ -d "$persistent/images" ]] \
    && find "$persistent/images" -mindepth 1 -print -quit | grep -q .; then
    fail "Both old and new image stores contain data. No files were changed; resolve the migration before installing."
  fi
  cp -a "$legacy/." "$persistent/"
  verify_copy
  echo "Copied existing catalogue and images; original files were preserved."
fi
