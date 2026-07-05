#!/usr/bin/env bash
# Collect open GitHub issues and local spine backlog snapshot.
# Usage: from repo root: skills/router-backlog-orchestrator/scripts/collect-backlog.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

echo "=== pi-smart-router backlog snapshot ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Repo: $REPO_ROOT"
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"
echo ""

echo "=== GitHub open issues (beettlle/pi-smart-router) ==="
if command -v gh >/dev/null 2>&1; then
  gh issue list --repo beettlle/pi-smart-router --state open --limit 100 \
    --json number,title,labels,url,createdAt \
    2>/dev/null || echo "(gh failed — check auth)"
else
  echo "(gh not installed)"
fi
echo ""

echo "=== Spine plan pending ==="
if command -v spine >/dev/null 2>&1; then
  spine plan pending 2>/dev/null || true
else
  echo "(spine not installed)"
fi
echo ""

echo "=== Orphan PROMPT packets (no .DONE) ==="
find spine-tasks -name PROMPT.md 2>/dev/null | while read -r prompt; do
  dir="$(dirname "$prompt")"
  if [[ ! -f "$dir/.DONE" ]]; then
    echo "$dir"
  fi
done

echo ""
echo "=== Next Task ID (from CONTEXT.md) ==="
grep -E '^\*\*Next Task ID:\*\*' spine-tasks/CONTEXT.md 2>/dev/null || echo "(CONTEXT.md not found)"
