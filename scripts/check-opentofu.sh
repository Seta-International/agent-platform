#!/usr/bin/env sh
# OpenTofu gate: runs `tofu fmt -check` and `tofu validate` against every
# directory under infra/opentofu/ that contains *.tf files.
#
# Exit 0 if all checks pass.
# Exit 1 if any directory fails fmt or validate.
# Exit 0 with a warning if `tofu` is not installed (so non-infra contributors
#   don't have to install OpenTofu to run `pnpm lint`).
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOFU_ROOT="$REPO_ROOT/infra/opentofu"

if [ ! -d "$TOFU_ROOT" ]; then
  printf '[check-opentofu] no infra/opentofu/ directory; skipping.\n'
  exit 0
fi

if ! command -v tofu >/dev/null 2>&1; then
  printf '[check-opentofu] tofu CLI not found; install OpenTofu >= 1.10 to gate locally.\n' >&2
  printf '[check-opentofu] CI will run this check on a runner with tofu installed.\n' >&2
  exit 0
fi

# Collect every directory under infra/opentofu/ that has at least one .tf file.
TARGETS="$(find "$TOFU_ROOT" -type f -name '*.tf' -exec dirname {} \; | sort -u)"

if [ -z "$TARGETS" ]; then
  printf '[check-opentofu] no .tf files found under %s; nothing to check.\n' "$TOFU_ROOT"
  exit 0
fi

FAIL=0
for dir in $TARGETS; do
  rel="${dir#"$REPO_ROOT/"}"

  if ! tofu fmt -check -recursive "$dir" >/dev/null; then
    printf '[check-opentofu] fmt drift in %s\n' "$rel" >&2
    FAIL=1
  fi

  # `tofu init -backend=false` is required before `validate` because validate
  # needs provider schemas. We use the lockfile if present; otherwise warn.
  (
    cd "$dir"
    if ! tofu init -backend=false -input=false >/dev/null 2>&1; then
      printf '[check-opentofu] init failed in %s (network required)\n' "$rel" >&2
      exit 1
    fi
    if ! tofu validate -no-color >/dev/null; then
      printf '[check-opentofu] validate failed in %s\n' "$rel" >&2
      tofu validate -no-color >&2
      exit 1
    fi
  ) || FAIL=1
done

if [ "$FAIL" -ne 0 ]; then
  printf '[check-opentofu] one or more directories failed.\n' >&2
  exit 1
fi

printf '[check-opentofu] OK.\n'
