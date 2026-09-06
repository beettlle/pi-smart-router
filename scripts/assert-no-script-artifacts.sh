#!/usr/bin/env bash
# Guard: no compiled artifacts tracked under scripts/ (SP-265, GitHub #150).
#
# scripts/ holds TypeScript sources executed via tsx / vitest, which remap
# `./x.js` import specifiers to the `x.ts` source on disk. Tracked compiled
# duplicates (scripts/src/**, sibling .js/.d.ts/.map files next to .ts sources)
# drift silently from src/ and shadow the real sources. Fail if any are tracked.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

offenders="$(git ls-files scripts | grep -E '^(scripts/src/|.*\.(js|js\.map|d\.ts|d\.ts\.map)$)' || true)"

if [[ -n "$offenders" ]]; then
  echo "error: compiled artifacts tracked under scripts/ (silent drift risk, #150):" >&2
  echo "$offenders" | sed 's/^/  - /' >&2
  echo "" >&2
  echo "Remove them with 'git rm' — scripts run from TypeScript sources via tsx." >&2
  exit 1
fi

echo "scripts/: no tracked compiled artifacts"
