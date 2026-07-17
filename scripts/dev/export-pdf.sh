#!/usr/bin/env bash
# Export a Markdown file (with mermaid diagrams) to a PDF.
#
# Mermaid code blocks are pre-rendered to SVG locally (the mermaid library is
# bundled — no network), then embedded into the PDF. A headless browser is
# required; an already-installed Chrome/Chromium/Edge is reused so nothing
# heavy is downloaded.
#
# Usage:
#   scripts/dev/export-pdf.sh <input.md> [output.pdf]
#
# Defaults the output to <input>.pdf next to the source.
#
# Requirements: Node (npx) + a Chrome/Chromium/Edge install.
# Env overrides:
#   CHROME_PATH   explicit path to a Chrome/Chromium/Edge executable.
set -euo pipefail

log() { printf 'export-pdf: %s\n' "$*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STYLE_CSS="$SCRIPT_DIR/pdf-style.css"

[ $# -ge 1 ] || { log "usage: scripts/dev/export-pdf.sh <input.md> [output.pdf]"; exit 2; }
IN="$1"
[ -f "$IN" ] || { log "input not found: $IN"; exit 2; }

IN_ABS="$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")"
OUT="${2:-${IN_ABS%.md}.pdf}"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

find_chrome() {
  if [ -n "${CHROME_PATH:-}" ] && [ -x "$CHROME_PATH" ]; then echo "$CHROME_PATH"; return 0; fi
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "$(command -v google-chrome 2>/dev/null || true)" \
    "$(command -v chromium 2>/dev/null || true)" \
    "$(command -v chromium-browser 2>/dev/null || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return 0; }
  done
  return 1
}

command -v npx >/dev/null 2>&1 || { log "npx (Node) is required"; exit 1; }
CHROME="$(find_chrome)" || { log "no Chrome/Chromium/Edge found — set CHROME_PATH"; exit 1; }
TIMEOUT_BIN="$(command -v timeout 2>/dev/null || command -v gtimeout 2>/dev/null || true)"

BD="$(mktemp -d)"
trap 'rm -rf "$BD"' EXIT

cp "$IN_ABS" "$BD/doc.md"
cat > "$BD/pptr.json" <<EOF
{ "executablePath": "$CHROME", "args": ["--no-sandbox"] }
EOF
LAUNCH="{\"executablePath\":\"$CHROME\",\"args\":[\"--no-sandbox\"]}"

# Polished print styling + page geometry/footer. Falls back to md-to-pdf's
# default styling if the sibling stylesheet is missing.
STYLE_ARGS=()
if [ -f "$STYLE_CSS" ]; then
  cp "$STYLE_CSS" "$BD/style.css"
  STYLE_ARGS=(--stylesheet style.css --body-class "")
fi
# Optional footer captions: PDF_FOOTER_LEFT / PDF_FOOTER_RIGHT env vars.
FOOT_L="${PDF_FOOTER_LEFT:-}"
FOOT_R="${PDF_FOOTER_RIGHT:-}"
PDF_OPTIONS="{\"format\":\"A4\",\"printBackground\":true,\"margin\":{\"top\":\"20mm\",\"bottom\":\"18mm\",\"left\":\"16mm\",\"right\":\"16mm\"},\"displayHeaderFooter\":true,\"headerTemplate\":\"<span></span>\",\"footerTemplate\":\"<div style=\\\"font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:7.5px;letter-spacing:0.03em;color:#8a93a3;width:100%;display:flex;justify-content:space-between;align-items:center;padding:0 16mm;\\\"><span>$FOOT_L</span><span><span class=\\\"pageNumber\\\"></span> / <span class=\\\"totalPages\\\"></span></span><span>$FOOT_R</span></div>\"}"

export PUPPETEER_SKIP_DOWNLOAD=1 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
cd "$BD"

log "rendering mermaid diagrams (browser: $CHROME)…"
npx --yes @mermaid-js/mermaid-cli -p pptr.json -i doc.md -o doc.rendered.md >/dev/null 2>&1 \
  || { log "mermaid render failed"; exit 1; }

run_md2pdf() {
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" 120 npx --yes md-to-pdf --launch-options "$LAUNCH" --pdf-options "$PDF_OPTIONS" "${STYLE_ARGS[@]+${STYLE_ARGS[@]}}" doc.rendered.md >/dev/null 2>&1 || true
  else
    npx --yes md-to-pdf --launch-options "$LAUNCH" --pdf-options "$PDF_OPTIONS" "${STYLE_ARGS[@]+${STYLE_ARGS[@]}}" doc.rendered.md >/dev/null 2>&1 || true
  fi
}

log "converting to PDF…"
ok=0
for i in 1 2 3; do
  run_md2pdf
  [ -f doc.rendered.pdf ] && { ok=1; break; }
  log "  attempt $i produced nothing — retrying (headless cold-start)…"
done
[ "$ok" = 1 ] || { log "md-to-pdf failed after 3 attempts"; exit 1; }

cp doc.rendered.pdf "$OUT_ABS"
log "done → $OUT_ABS"
