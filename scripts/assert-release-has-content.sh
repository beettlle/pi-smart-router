#!/usr/bin/env bash
# Fail if the range FROM_TAG..TO_REF is only a root package version bump
# (package.json / package-lock.json version fields for pi-smart-router).
#
# Usage:
#   scripts/assert-release-has-content.sh
#   scripts/assert-release-has-content.sh <FROM_TAG> [TO_REF]
#   FROM_TAG=v0.19.3 TO_REF=v0.19.4 scripts/assert-release-has-content.sh
#
# Defaults: previous v* semver tag → HEAD (or TO_REF / GITHUB_REF_NAME when set).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PKG_NAME="$(node -p "require('./package.json').name")"

is_semver_tag() {
  [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-].*)?$ ]]
}

# Print ancestor semver tags of REF, newest first (version sort).
list_ancestor_semver_tags() {
  local ref="$1"
  git tag -l 'v*' --sort=-v:refname | while read -r t; do
    if ! is_semver_tag "$t"; then
      continue
    fi
    if git merge-base --is-ancestor "$t" "$ref" 2>/dev/null; then
      printf '%s\n' "$t"
    fi
  done
}

# Given CURRENT_TAG (may be empty), print the previous ancestor semver tag of TO_REF.
resolve_previous_tag() {
  local current_tag="$1"
  local ref="$2"
  local t
  local seen_current=0

  while IFS= read -r t; do
    if [[ -n "$current_tag" && "$t" == "$current_tag" ]]; then
      seen_current=1
      continue
    fi
    if [[ -n "$current_tag" ]]; then
      if [[ "$seen_current" -eq 1 ]]; then
        printf '%s\n' "$t"
        return 0
      fi
      # Tags newer than current that are still ancestors (odd history) — skip until current.
      continue
    fi
    # No current tag: newest ancestor is the previous release baseline.
    printf '%s\n' "$t"
    return 0
  done < <(list_ancestor_semver_tags "$ref")

  return 1
}

TO_REF="${TO_REF:-${2:-HEAD}}"
FROM_TAG="${FROM_TAG:-${1:-}}"

CURRENT_TAG_NAME=""
if is_semver_tag "$TO_REF"; then
  CURRENT_TAG_NAME="$TO_REF"
elif [[ -n "${GITHUB_REF_NAME:-}" ]] && is_semver_tag "${GITHUB_REF_NAME}"; then
  CURRENT_TAG_NAME="$GITHUB_REF_NAME"
else
  while IFS= read -r t; do
    if is_semver_tag "$t"; then
      CURRENT_TAG_NAME="$t"
    fi
  done < <(git tag --points-at "$TO_REF" -l 'v*')
fi

if [[ -z "$FROM_TAG" ]]; then
  if ! FROM_TAG="$(resolve_previous_tag "$CURRENT_TAG_NAME" "$TO_REF")"; then
    echo "ERROR: could not resolve previous release tag for TO_REF=$TO_REF"
    exit 1
  fi
fi

if [[ -z "$FROM_TAG" ]]; then
  echo "ERROR: could not resolve previous release tag for TO_REF=$TO_REF"
  exit 1
fi

if ! git rev-parse -q --verify "${FROM_TAG}^{commit}" >/dev/null; then
  echo "ERROR: FROM_TAG does not resolve: $FROM_TAG"
  exit 1
fi
if ! git rev-parse -q --verify "${TO_REF}^{commit}" >/dev/null; then
  echo "ERROR: TO_REF does not resolve: $TO_REF"
  exit 1
fi

echo "assert-release-has-content: ${FROM_TAG}..${TO_REF}"

CHANGED=()
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  CHANGED+=("$path")
done < <(git diff --name-only "${FROM_TAG}..${TO_REF}")

if [[ "${#CHANGED[@]}" -eq 0 ]]; then
  echo "ERROR: empty/contentless release — no file changes between $FROM_TAG and $TO_REF"
  exit 1
fi

CONTENT_PATHS=()
ONLY_VERSION_META=1
for path in "${CHANGED[@]}"; do
  case "$path" in
    package.json|package-lock.json)
      ;;
    *)
      CONTENT_PATHS+=("$path")
      ONLY_VERSION_META=0
      ;;
  esac
done

if [[ "$ONLY_VERSION_META" -eq 0 ]]; then
  echo "PASS: substantive paths changed (${#CONTENT_PATHS[@]} non-meta, ${#CHANGED[@]} total)"
  i=0
  for path in "${CONTENT_PATHS[@]}"; do
    i=$((i + 1))
    if [[ "$i" -le 20 ]]; then
      printf '  %s\n' "$path"
    fi
  done
  if [[ "${#CONTENT_PATHS[@]}" -gt 20 ]]; then
    echo "  ... ($(( ${#CONTENT_PATHS[@]} - 20 )) more)"
  fi
  exit 0
fi

PKG_DIFF="$(git diff "${FROM_TAG}..${TO_REF}" -- package.json || true)"
if [[ -n "$PKG_DIFF" ]]; then
  NON_VERSION_HITS="$(
    printf '%s\n' "$PKG_DIFF" | awk '
      /^[+-][+-][+-]/ { next }
      /^[+-]/ {
        line = substr($0, 2)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if (line == "" || line == "{" || line == "}" || line == "},") next
        if (line ~ /^"version"[[:space:]]*:/) next
        print
      }
    '
  )"
  if [[ -n "$NON_VERSION_HITS" ]]; then
    echo "ERROR: package.json has changes beyond the version field between $FROM_TAG and $TO_REF:"
    printf '%s\n' "$NON_VERSION_HITS"
    exit 1
  fi
fi

LOCK_DIFF="$(git diff "${FROM_TAG}..${TO_REF}" -- package-lock.json || true)"
if [[ -n "$LOCK_DIFF" ]]; then
  NON_LOCK_HITS="$(
    printf '%s\n' "$LOCK_DIFF" | awk -v pkg="$PKG_NAME" '
      /^[+-][+-][+-]/ { next }
      /^[+-]/ {
        line = substr($0, 2)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if (line == "" || line == "{" || line == "}" || line == "},") next
        if (line ~ /^"version"[[:space:]]*:/) next
        if (line ~ /^"name"[[:space:]]*:/ && index(line, pkg) > 0) next
        if (line ~ /^"packages"[[:space:]]*:/) next
        if (line ~ /^"":[[:space:]]*\{/) next
        print
      }
    '
  )"
  if [[ -n "$NON_LOCK_HITS" ]]; then
    echo "ERROR: package-lock.json has changes beyond root package version metadata between $FROM_TAG and $TO_REF:"
    printf '%s\n' "$NON_LOCK_HITS" | head -n 40
    exit 1
  fi
fi

echo "ERROR: empty/contentless release — only root package version metadata changed between $FROM_TAG and $TO_REF"
echo "Changed paths:"
for path in "${CHANGED[@]}"; do
  printf '  %s\n' "$path"
done
echo "Refuse publish. Use a new themed release with real content, or deprecate this tag via npm-deprecate workflow."
exit 1
