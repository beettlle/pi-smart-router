#!/usr/bin/env bash
# Post-publish consumer smoke: pi install from npm and pi.dev gallery sync.
set -euo pipefail

VERSION="${1:?usage: post-publish-pi-smoke.sh <semver>}"

echo "Waiting for pi-smart-router@${VERSION} on npm registry..."
for attempt in $(seq 1 30); do
  if npm view "pi-smart-router@${VERSION}" version >/dev/null 2>&1; then
    npm view "pi-smart-router@${VERSION}" version
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "ERROR: pi-smart-router@${VERSION} not found on npm after 5 minutes"
    exit 1
  fi
  sleep 10
done

echo "Installing pi coding agent CLI..."
npm install -g --ignore-scripts "@earendil-works/pi-coding-agent@^0.80.0"
pi --version

echo "Installing pi-smart-router from npm (pi consumer path)..."
pi install "npm:pi-smart-router@${VERSION}"

echo "Verifying smart-router provider registration..."
pi --list-models | grep -F 'smart-router'

echo "Verifying pi.dev package gallery lists ${VERSION}..."
for attempt in $(seq 1 12); do
  page="$(curl -fsSL "https://pi.dev/packages/pi-smart-router")"
  if echo "$page" | grep -q "${VERSION}"; then
    echo "pi.dev/packages/pi-smart-router shows version ${VERSION}"
    exit 0
  fi
  if [ "$attempt" -eq 12 ]; then
    echo "ERROR: pi.dev gallery did not show version ${VERSION} within 6 minutes"
    exit 1
  fi
  echo "pi.dev sync pending (attempt ${attempt}/12)..."
  sleep 30
done
