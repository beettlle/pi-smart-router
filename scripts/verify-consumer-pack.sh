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
test -f ".pi/extensions/smart-router/pi-model-scope.ts"

node --input-type=module <<'EOF'
import 'yaml';
import 'zod';
import 'better-sqlite3';
console.log('Consumer runtime imports: yaml, zod, better-sqlite3 OK');
EOF

# SP-141: extension bootstrap from a clean project dir (no dev-repo node_modules).
PACK_DIR="$(pwd)"
CONSUMER_PROJECT="$(mktemp -d)"
VERIFY_HOME="$(mktemp -d)"
mkdir -p "$VERIFY_HOME/.pi/agent/npm"

PI_CODING_AGENT_VERSION="$(
  node -p "require('$ROOT/package.json').devDependencies['@earendil-works/pi-coding-agent'].replace(/^\\^/, '')"
)"
echo "Simulating pi agent npm with @earendil-works/pi-coding-agent@${PI_CODING_AGENT_VERSION}"
npm install --prefix "$VERIFY_HOME/.pi/agent/npm" --omit=dev --silent \
  "@earendil-works/pi-coding-agent@${PI_CODING_AGENT_VERSION}"

BOOTSTRAP_MODULE="$PACK_DIR/.pi/extensions/smart-router/pi-model-scope.ts"
export HOME="$VERIFY_HOME"
unset NODE_PATH

cd "$CONSUMER_PROJECT"
echo "Extension bootstrap from clean project $(pwd) importing $BOOTSTRAP_MODULE"
node --experimental-strip-types --input-type=module <<EOF
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL('$BOOTSTRAP_MODULE').href;
const { resolveModelScope, findPiCodingAgentDir } = await import(moduleUrl);

findPiCodingAgentDir();
await resolveModelScope([], { getAvailable: async () => [] });
console.log('Extension bootstrap from clean project: resolveModelScope OK');
EOF

echo "Consumer pack verify passed"
