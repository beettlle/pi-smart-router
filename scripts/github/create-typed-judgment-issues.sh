#!/usr/bin/env bash
# Create the typed-judgment issue batch from spine-tasks/_authoring/issues/typed-judgment/.
# Creates two sprint milestones, the epic, eight child issues, re-edits the epic with
# child numbers, writes the manifest, then posts cross-link comments on existing issues.
# Idempotency: aborts if the manifest exists or if any batch title already exists.
set -euo pipefail

REPO="beettlle/pi-smart-router"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

DRAFT_DIR="$REPO_ROOT/spine-tasks/_authoring/issues/typed-judgment"
COMMENT_DIR="$DRAFT_DIR/comments"
MANIFEST="$REPO_ROOT/scripts/github/typed-judgment-issues-created.txt"

MILESTONE_1="Sprint 1 — typed judgment foundation"
MILESTONE_1_DESC="TypedJudgmentPort + adapter, state/question schema, hydra-input loop flag fix, #179 deterministic floor."
MILESTONE_2="Sprint 2 — consumers + eval"
MILESTONE_2_DESC="typed_judgment stage, tier hints and local_zero gates, HyDRA requirement source, adaptive reasoning, eval comparison."

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI required" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh not authenticated — run: gh auth login" >&2
  exit 1
fi

if [[ -f "$MANIFEST" ]]; then
  echo "error: manifest already exists ($MANIFEST); aborting to avoid duplicates." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

title_exists() {
  local title="$1"
  local count
  count="$(gh issue list -R "$REPO" --state all --search "in:title \"${title}\"" --json title \
    --jq "[.[] | select(.title == \"${title//\"/\\\"}\")] | length")"
  [[ "$count" != "0" ]]
}

ensure_milestone() {
  local title="$1"
  local description="$2"
  local existing
  existing="$(gh api "repos/$REPO/milestones?state=all&per_page=100" \
    --jq ".[] | select(.title == \"${title}\") | .number")"
  if [[ -n "$existing" ]]; then
    echo "Milestone exists: ${title} (#${existing})" >&2
    return
  fi
  gh api -X POST "repos/$REPO/milestones" -f title="$title" -f description="$description" \
    --jq '.number' >/dev/null
  echo "Created milestone: ${title}" >&2
}

# Substitutes {{EPIC}} and {{T1}}..{{T8}} with issue numbers known so far.
render() {
  local src="$1"
  local dest="$WORK_DIR/$(basename "$src")"
  local args=()
  local key
  for key in EPIC T1 T2 T3 T4 T5 T6 T7 T8; do
    local var="ISSUE_${key}"
    if [[ -n "${!var:-}" ]]; then
      args+=(-e "s/{{${key}}}/#${!var}/g")
    fi
  done
  if [[ ${#args[@]} -gt 0 ]]; then
    sed "${args[@]}" "$src" >"$dest"
  else
    cp "$src" "$dest"
  fi
  if grep -q '{{[A-Z0-9]*}}' "$dest"; then
    echo "error: unresolved placeholder in $(basename "$src"):" >&2
    grep -o '{{[A-Z0-9]*}}' "$dest" | sort -u >&2
    exit 1
  fi
  echo "$dest"
}

create_issue() {
  local title="$1"
  local milestone="$2"
  local body_file="$3"
  shift 3
  local labels=("$@")

  if [[ ! -f "$body_file" ]]; then
    echo "error: missing body file: $body_file" >&2
    exit 1
  fi

  local rendered
  rendered="$(render "$body_file")"

  local args=(issue create -R "$REPO" --title "$title" --body-file "$rendered")
  local label
  for label in "${labels[@]}"; do
    args+=(--label "$label")
  done
  if [[ -n "$milestone" ]]; then
    args+=(--milestone "$milestone")
  fi

  local url
  url="$(gh "${args[@]}")"
  local num
  num="$(echo "$url" | grep -oE '[0-9]+$')"
  echo "Created #${num}: ${title}" >&2
  echo "$num"
}

TITLE_EPIC="[Epic] Typed-judgment routing signals (Jev-compatible System One)"
TITLE_T1="routing: P1 — TypedJudgmentPort + Jev-compatible HTTP adapter (local OpenJev default, hosted opt-in)"
TITLE_T2="routing: P1 — readable routing state + six-question typed-judgment schema"
TITLE_T3="[bug] hydra-input loop flag uses substring failure grep (follow-on #132)"
TITLE_T4="routing: P1 — typed_judgment pipeline stage (user turns only, non-deciding, fail-open)"
TITLE_T5="routing: P1 — consume typed judgment for tier hints and local_zero gates"
TITLE_T6="routing: P2 — typed judgment as HyDRA requirement source (hydra.requirements_source)"
TITLE_T7="routing: P2 — adaptive reasoning uses needs_deep_reasoning (follow-on #166)"
TITLE_T8="eval: P1 — typed judgment vs MiniLM projection counterfactual comparison + latency benchmark"

for title in "$TITLE_EPIC" "$TITLE_T1" "$TITLE_T2" "$TITLE_T3" "$TITLE_T4" \
  "$TITLE_T5" "$TITLE_T6" "$TITLE_T7" "$TITLE_T8"; do
  if title_exists "$title"; then
    echo "error: issue already exists with title: $title" >&2
    exit 1
  fi
done

echo "Creating typed-judgment batch (2 milestones, 1 epic, 8 issues)..."

ensure_milestone "$MILESTONE_1" "$MILESTONE_1_DESC"
ensure_milestone "$MILESTONE_2" "$MILESTONE_2_DESC"

# The epic body references children, so it is created from a stub and re-edited at the end.
mkdir -p "$WORK_DIR/stub"
EPIC_STUB="$WORK_DIR/stub/epic-stub.md"
echo "Typed-judgment epic — body is filled in once child issues exist." >"$EPIC_STUB"
ISSUE_EPIC="$(create_issue "$TITLE_EPIC" "" "$EPIC_STUB" "priority/P1" "enhancement")"

ISSUE_T1="$(create_issue "$TITLE_T1" "$MILESTONE_1" "$DRAFT_DIR/T1-typed-judgment-port.md" "priority/P1" "enhancement")"
ISSUE_T2="$(create_issue "$TITLE_T2" "$MILESTONE_1" "$DRAFT_DIR/T2-state-and-questions.md" "priority/P1" "enhancement")"
ISSUE_T3="$(create_issue "$TITLE_T3" "$MILESTONE_1" "$DRAFT_DIR/T3-hydra-input-loop-flag.md" "priority/P2" "bug")"
ISSUE_T4="$(create_issue "$TITLE_T4" "$MILESTONE_2" "$DRAFT_DIR/T4-typed-judgment-stage.md" "priority/P1" "enhancement")"
ISSUE_T5="$(create_issue "$TITLE_T5" "$MILESTONE_2" "$DRAFT_DIR/T5-tier-hints-and-gates.md" "priority/P1" "enhancement")"
ISSUE_T6="$(create_issue "$TITLE_T6" "$MILESTONE_2" "$DRAFT_DIR/T6-hydra-requirements-source.md" "priority/P2" "enhancement")"
ISSUE_T7="$(create_issue "$TITLE_T7" "$MILESTONE_2" "$DRAFT_DIR/T7-adaptive-reasoning.md" "priority/P2" "enhancement")"
ISSUE_T8="$(create_issue "$TITLE_T8" "$MILESTONE_2" "$DRAFT_DIR/T8-eval-comparison.md" "priority/P1" "enhancement")"

gh issue edit "$ISSUE_EPIC" -R "$REPO" --body-file "$(render "$DRAFT_DIR/E-epic.md")" >/dev/null
echo "Updated epic #${ISSUE_EPIC} body with child numbers" >&2

{
  echo "# Created $(date -u +%Y-%m-%dT%H:%M:%SZ) — typed-judgment batch"
  echo "EPIC=${ISSUE_EPIC}"
  echo "T1=${ISSUE_T1}"
  echo "T2=${ISSUE_T2}"
  echo "T3=${ISSUE_T3}"
  echo "T4=${ISSUE_T4}"
  echo "T5=${ISSUE_T5}"
  echo "T6=${ISSUE_T6}"
  echo "T7=${ISSUE_T7}"
  echo "T8=${ISSUE_T8}"
} >"$MANIFEST"

echo "Posting cross-link comments and milestone on existing issues..."
gh issue edit 179 -R "$REPO" --milestone "$MILESTONE_1" >/dev/null
gh issue comment 179 -R "$REPO" --body-file "$(render "$COMMENT_DIR/179.md")" >/dev/null
for existing in 96 167 110; do
  gh issue comment "$existing" -R "$REPO" --body-file "$(render "$COMMENT_DIR/encoder-path.md")" >/dev/null
done
gh issue comment 181 -R "$REPO" --body-file "$(render "$COMMENT_DIR/181.md")" >/dev/null
gh issue comment 169 -R "$REPO" --body-file "$(render "$COMMENT_DIR/169.md")" >/dev/null
gh issue comment 112 -R "$REPO" --body-file "$(render "$COMMENT_DIR/112.md")" >/dev/null
echo "comments=179,96,167,110,181,169,112" >>"$MANIFEST"

echo ""
echo "=== Created typed-judgment batch ==="
cat "$MANIFEST"
echo ""
echo "Manifest: $MANIFEST"
