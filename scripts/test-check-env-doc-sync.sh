#!/usr/bin/env sh
# Tests for scripts/check-env-doc-sync.sh. Self-contained: builds tmp fixtures.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$SCRIPT_DIR/check-env-doc-sync.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { printf '  ok  %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; exit 1; }

# --- Test 1: missing .env.example exits 0 with notice ----------------------
T1_OUT="$TMP/t1.err"
if "$TARGET" "$TMP/does-not-exist" "$TMP/doc.md" 2>"$T1_OUT"; then
  grep -q 'Layer 1 not yet landed' "$T1_OUT" || fail "T1: missing notice text"
  pass "missing .env.example -> exit 0 with notice"
else
  fail "T1: expected exit 0 when .env.example missing"
fi

# --- Test 2: missing configuration.md exits 2 -----------------------------
printf 'FOO=bar\n' > "$TMP/env.t2"
set +e
"$TARGET" "$TMP/env.t2" "$TMP/no-doc.md" 2>/dev/null
RC=$?
set -e
[ "$RC" -eq 2 ] || fail "T2: expected exit 2, got $RC"
pass "missing configuration.md -> exit 2"

# --- Test 3: in-sync -> exit 0 with OK message ----------------------------
cat > "$TMP/env.t3" <<'EOF'
# comment ignored
FOO=one
BAR=two
EOF
cat > "$TMP/doc.t3.md" <<'EOF'
# Configuration reference
## Vars
### FOO
description
### BAR
description
EOF
OUT="$("$TARGET" "$TMP/env.t3" "$TMP/doc.t3.md")"
echo "$OUT" | grep -q 'OK -- 2 vars in sync' || fail "T3: wrong OK message: $OUT"
pass "in-sync -> exit 0 with OK"

# --- Test 4: var in env but not in doc -> exit 1, list undocumented -------
cat > "$TMP/env.t4" <<'EOF'
FOO=one
BAZ=three
EOF
cat > "$TMP/doc.t4.md" <<'EOF'
### FOO
EOF
set +e
ERR="$("$TARGET" "$TMP/env.t4" "$TMP/doc.t4.md" 2>&1 >/dev/null)"
RC=$?
set -e
[ "$RC" -eq 1 ] || fail "T4: expected exit 1, got $RC"
echo "$ERR" | grep -q 'BAZ' || fail "T4: expected BAZ in stderr: $ERR"
pass "undocumented var -> exit 1, named in stderr"

# --- Test 5: var in doc but not in env -> exit 1, list extras -------------
cat > "$TMP/env.t5" <<'EOF'
FOO=one
EOF
cat > "$TMP/doc.t5.md" <<'EOF'
### FOO
### GHOST
EOF
set +e
ERR="$("$TARGET" "$TMP/env.t5" "$TMP/doc.t5.md" 2>&1 >/dev/null)"
RC=$?
set -e
[ "$RC" -eq 1 ] || fail "T5: expected exit 1, got $RC"
echo "$ERR" | grep -q 'GHOST' || fail "T5: expected GHOST in stderr: $ERR"
pass "stale doc entry -> exit 1, named in stderr"

# --- Test 6: ignores non-VAR lines and lowercase --------------------------
cat > "$TMP/env.t6" <<'EOF'
# header comment
foo_lowercase=skip
FOO=one
   leading_space=skip
BAR=two
EOF
cat > "$TMP/doc.t6.md" <<'EOF'
### FOO
### BAR
### Some Heading That Is Not A Var
EOF
OUT="$("$TARGET" "$TMP/env.t6" "$TMP/doc.t6.md")"
echo "$OUT" | grep -q 'OK -- 2 vars in sync' || fail "T6: wrong OK: $OUT"
pass "non-VAR lines and non-VAR headings ignored"

echo "all tests passed"
