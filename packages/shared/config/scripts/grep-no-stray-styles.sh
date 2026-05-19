#!/usr/bin/env bash
set -e

fail() { echo "❌ $1" >&2; exit 1; }

stray_css=$(find packages apps \
  \( -name '*.css' -o -name '*.scss' \) \
  -not -path 'packages/shared/ui/src/styles/*' \
  -not -path 'apps/web/src/styles/globals.css' \
  -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.turbo/*' \
  2>/dev/null || true)
[ -z "$stray_css" ] || fail "stray CSS files:
$stray_css"

stray_config=$(find packages apps -name 'tailwind.config.*' \
  -not -path '*/node_modules/*' \
  2>/dev/null || true)
[ -z "$stray_config" ] || fail "tailwind.config.* found:
$stray_config"

stray_directive=$(grep -rEl '@theme|@layer|@apply' packages apps \
  --include='*.css' --include='*.scss' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.turbo \
  2>/dev/null \
  | grep -v '^packages/shared/ui/' \
  || true)
[ -z "$stray_directive" ] || fail "Tailwind directives outside shared/ui:
$stray_directive"

echo "✅ no stray styles"
