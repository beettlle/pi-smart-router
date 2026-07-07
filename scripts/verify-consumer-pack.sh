#!/usr/bin/env bash
# Simulates pi install dependency resolution: pack tarball and npm install --omit=dev.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARBALL="$(npm pack --silent)"
WORKDIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORKDIR"
  rm -f "$ROOT/$TARBALL"
}
trap cleanup EXIT

mkdir -p "$WORKDIR/pkg"
tar -xzf "$ROOT/$TARBALL" -C "$WORKDIR/pkg" --strip-components=1

cd "$WORKDIR/pkg"
echo "Consumer install in $(pwd) from $TARBALL"
npm install --omit=dev

for dep in yaml zod better-sqlite3 @huggingface/transformers; do
  if [ ! -e "node_modules/$dep" ]; then
    echo "ERROR: missing production dependency: $dep"
    exit 1
  fi
done

test -f ".pi/extensions/smart-router/index.ts"

node --input-type=module <<'EOF'
import 'yaml';
import 'zod';
import 'better-sqlite3';
console.log('Consumer runtime imports: yaml, zod, better-sqlite3 OK');
EOF

echo "Consumer pack verify passed"
