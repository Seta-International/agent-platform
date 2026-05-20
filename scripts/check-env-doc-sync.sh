#!/usr/bin/env sh
# Diff env var names between .env.example and docs/hosting/configuration.md.
# Exits 0 in sync (or if .env.example missing), 1 on drift, 2 on bad inputs.
set -eu

ENV_FILE="${1:-.env.example}"
DOC_FILE="${2:-docs/hosting/configuration.md}"

if [ ! -f "$ENV_FILE" ]; then
  printf '[check-env-doc-sync] .env.example not found -- Layer 1 not yet landed; skipping.\n' >&2
  exit 0
fi

if [ ! -f "$DOC_FILE" ]; then
  printf '[check-env-doc-sync] configuration.md not found at %s\n' "$DOC_FILE" >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

awk '/^[A-Z][A-Z0-9_]*=/ { sub(/=.*/, ""); print }' "$ENV_FILE" | sort -u > "$TMP/env.list"
awk '/^### [A-Z][A-Z0-9_]*$/ { sub(/^### /, ""); print }' "$DOC_FILE" | sort -u > "$TMP/doc.list"

ENV_COUNT=$(wc -l < "$TMP/env.list" | tr -d ' ')
DOC_COUNT=$(wc -l < "$TMP/doc.list" | tr -d ' ')

UNDOCUMENTED="$(comm -23 "$TMP/env.list" "$TMP/doc.list")"
STALE="$(comm -13 "$TMP/env.list" "$TMP/doc.list")"

if [ -z "$UNDOCUMENTED" ] && [ -z "$STALE" ]; then
  printf '[check-env-doc-sync] OK -- %s vars in sync.\n' "$ENV_COUNT"
  exit 0
fi

printf '[check-env-doc-sync] drift detected.\n' >&2
if [ -n "$UNDOCUMENTED" ]; then
  printf '  Present in .env.example but missing from configuration.md:\n' >&2
  printf '    %s\n' $UNDOCUMENTED >&2
fi
if [ -n "$STALE" ]; then
  printf '  Present in configuration.md but missing from .env.example:\n' >&2
  printf '    %s\n' $STALE >&2
fi
printf '  env=%s doc=%s\n' "$ENV_COUNT" "$DOC_COUNT" >&2
exit 1
