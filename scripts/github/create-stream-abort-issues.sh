#!/usr/bin/env bash
# Create stream delegation / abort handling backlog issues (2026-07-10).
# Idempotency: aborts if manifest exists or any issue with "stream-abort:" in title exists.
set -euo pipefail

REPO="beettlle/pi-smart-router"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI required" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh not authenticated — run: gh auth login" >&2
  exit 1
fi

MANIFEST="$REPO_ROOT/scripts/github/stream-abort-issues-created.txt"
if [[ -f "$MANIFEST" ]]; then
  echo "warning: manifest exists ($MANIFEST); aborting to avoid duplicates." >&2
  exit 1
fi

STREAM_ABORT_COUNT="$(gh issue list --repo "$REPO" --state all --search 'stream-abort: in:title' --json number 2>/dev/null | jq 'length' || echo 0)"
if [[ "$STREAM_ABORT_COUNT" -ge 1 ]]; then
  echo "warning: found $STREAM_ABORT_COUNT stream-abort: issue(s); aborting to avoid duplicates." >&2
  exit 1
fi

TRACKING_SEARCH="$(gh issue list --repo "$REPO" --state all --search 'ESC/Ctrl-C ineffective in:title' --json number 2>/dev/null | jq 'length' || echo 0)"
if [[ "$TRACKING_SEARCH" -ge 1 ]]; then
  echo "warning: tracking issue may already exist (ESC/Ctrl-C search count=$TRACKING_SEARCH); aborting." >&2
  exit 1
fi

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

create_issue() {
  local title="$1"
  local labels="$2"
  local body_file="$3"
  local url
  url="$(gh issue create --repo "$REPO" --title "$title" --label "$labels" --body-file "$body_file")"
  echo "$url" | grep -oE '[0-9]+$'
}

ISSUE_TRACKING=""
ISSUE_PIPING=""
ISSUE_ABORT_TERMINAL=""
ISSUE_PRE_DELEGATION=""
ISSUE_SLASH_SIGNAL=""

echo "Creating tracking issue..."
cat >"$BODY_FILE" <<'EOF'
## Summary

Users report agent turns appearing **stuck** on `smart-router/auto`: no visible streaming progress, and **ESC / Ctrl-C do not stop** the turn. Symptoms often correlate with **tool use** (especially `read`) or turns involving **slash commands**.

This tracking issue links focused child fixes in the pi extension stream delegation path.

## Root cause (investigation summary)

1. **Buffered streams** — `collectDelegatedStream` accumulates all delegated provider events, then `flushDelegatedEvents` pushes them at once. Pi sees nothing until the full turn completes (including tool-call generation).
2. **Partial abort handling** — abort is polled only between inner stream events; no listener; inner stream not explicitly cancelled.
3. **Abort triggers failover** — thrown `Request was aborted` is caught by `routeAndDelegate` failover logic and may retry other models instead of stopping.
4. **No pre-delegation abort checks** — routing dispatch, `ensureFleetFresh`, and planning delegate sub-calls run without checking `options.signal`.
5. **Slash commands** — `/smart-router` handlers do not use `ctx.signal` for long async work (secondary repro path).

Reference: pi GitLab Duo custom provider pipes events live (`for await (const event of innerStream) stream.push(event)`).

## Steps to reproduce

1. Select `/model smart-router/auto`
2. Prompt that triggers a `read` tool call (or any tool-heavy turn)
3. Press ESC while waiting — especially **before any output appears**, or on the **post–tool-result** turn

## Expected

- Tokens and tool-call progress stream to the UI immediately
- ESC / Ctrl-C aborts promptly with `reason: 'aborted'` and **no failover retry**

## Actual

- UI appears frozen until delegation completes
- Cancel may be ignored or trigger failover to another model

## Child issues

<!-- Filled by create-stream-abort-issues.sh after child issues are created -->

- [ ] stream-abort: live event piping
- [ ] stream-abort: abort must not trigger failover
- [ ] stream-abort: pre-delegation abort checks
- [ ] stream-abort: slash commands honor ctx.signal

## Out of scope

- pi core built-in `read` tool execution (file upstream if repro persists after extension fixes)

## Verification (close this issue when all children are closed)

```bash
npm run typecheck && npm test
```

Manual dogfood: visible streaming on `smart-router/auto`; ESC aborts without failover retry.

## Suggested fix order

1. Abort terminal (failover bug) — small, immediate win
2. Live event piping — largest UX fix
3. Pre-delegation abort checks
4. Slash command `ctx.signal` (independent)

Issues 1+2 may ship in a single PR if preferred.
EOF
ISSUE_TRACKING="$(create_issue \
  "[bug] Agent turn appears stuck on smart-router/auto; ESC/Ctrl-C ineffective during tool use" \
  "bug" \
  "$BODY_FILE")"
echo "Created tracking #$ISSUE_TRACKING"

echo "Creating child 1/4: live event piping..."
cat >"$BODY_FILE" <<EOF
## Summary

Stream delegation **buffers all provider events** until the turn completes, then flushes them in one batch. Pi receives no \`text_delta\`, tool-call progress, or thinking tokens until delegation finishes — the UI looks frozen and cancel feels unresponsive.

Parent tracking: #$ISSUE_TRACKING

## Environment

- pi-smart-router: \`$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)\`
- Provider/model: \`smart-router/auto\` → delegated registry model
- Extension: \`.pi/extensions/smart-router/\`

## Steps to reproduce

1. \`/model smart-router/auto\`
2. Send a prompt that elicits a long streamed response or tool call
3. Observe: no tokens appear until the full provider stream completes

## Expected

Events forward to pi **live**, matching pi custom-provider pattern and SP-041 intent ("forward all stream events"):

\`\`\`typescript
for await (const event of innerStream) outer.push(event);
outer.end();
\`\`\`

## Actual

\`collectDelegatedStream\` in \`.pi/extensions/smart-router/delegate-stream.ts\` pushes events into an array; \`flushDelegatedEvents\` in \`delegation-runtime.ts\` emits them only after the inner stream ends.

## Files

- \`.pi/extensions/smart-router/delegate-stream.ts\`
- \`.pi/extensions/smart-router/route-and-delegate.ts\`
- \`.pi/extensions/smart-router/delegation-runtime.ts\` (\`flushDelegatedEvents\`, \`injectFailoverNotice\`)

## Implementation notes

- Refactor \`routeAndDelegate\` to pipe events to \`outer\` as they arrive (GitLab Duo reference in pi-coding-agent examples)
- **Failover notice:** \`injectFailoverNotice\` mutates a buffered array today; with live piping, push a synthetic \`text_delta\` (or equivalent) before starting the retry stream
- Keep \`delegateWithOutcome\` outcome recording after stream ends without re-buffering the happy path
- **Planning delegate:** \`defaultSpawnPlanningDelegate\` uses \`collectDelegatedStream\` — sub-call may stay buffered (no UI) or use a discard sink; document the choice

## Acceptance criteria

- [ ] Unit test: consumer receives \`text_delta\` or \`start\` **before** \`done\` on a mocked slow stream
- [ ] Existing delegation/failover tests updated, not removed
- [ ] Manual: visible streaming on \`smart-router/auto\` before tool-call completion

## Verification

\`\`\`bash
npm run typecheck && npm test
\`\`\`

## Related

- Blocks improved abort UX (stream-abort: abort must not trigger failover)
- SP-041 stream delegation; review gap noted mid-stream abort testing
EOF
ISSUE_PIPING="$(create_issue \
  "stream-abort: [bug] Stream delegation buffers events until turn completes — no live forwarding to pi" \
  "bug" \
  "$BODY_FILE")"
echo "Created #$ISSUE_PIPING"

echo "Creating child 2/4: abort terminal..."
cat >"$BODY_FILE" <<EOF
## Summary

When the user presses ESC, \`collectDelegatedStream\` throws \`Request was aborted\`, but \`routeAndDelegate\`'s \`catch\` block (~L514) treats it as a stream delegation failure: records \`STREAM_DELEGATION_ERROR\` and calls \`selectFailover\` → \`continue\`, potentially retrying another model instead of stopping.

The existing pre-aborted test passes only because mocks never delegate — not because abort is handled correctly end-to-end.

Parent tracking: #$ISSUE_TRACKING

## Environment

- pi-smart-router: \`$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)\`
- Provider/model: \`smart-router/auto\`

## Steps to reproduce

1. \`/model smart-router/auto\`
2. Start a streamed turn
3. Press ESC mid-stream (after at least one event)
4. Observe failover retry or continued work instead of clean abort

## Expected

If \`options?.signal?.aborted\` or \`stopReason === 'aborted'\`:
- Push \`{ type: 'error', reason: 'aborted', ... }\`
- \`outer.end()\`
- **No** \`selectFailover\`

## Actual

Abort throw enters failover \`catch\` path in \`.pi/extensions/smart-router/route-and-delegate.ts\`.

## Files

- \`.pi/extensions/smart-router/route-and-delegate.ts\`
- \`.pi/extensions/smart-router/delegate-stream.ts\`
- \`.pi/extensions/smart-router/stream-delegation.ts\`

## Acceptance criteria

- [ ] Shared helper e.g. \`isAbortError(error, options)\` or \`throwIfAborted(options)\`
- [ ] Unit test: **mid-stream abort** — mock emits 1–2 events then signal aborts; \`selectFailover\` **not** called; outer ends with \`reason: 'aborted'\`
- [ ] Unit test: pre-aborted signal still skips delegation (regression)
- [ ] Closes SP-041 review gap (mid-stream abort requested in \`spine-tasks/SP-041-stream-delegation/.reviews/3-20260704T182425.md\`)

## Verification

\`\`\`bash
npm run typecheck && npm test
\`\`\`

## Related

- Depends on / pairs with #$ISSUE_PIPING (live piping makes abort UX testable)
- May land in same PR as #$ISSUE_PIPING
EOF
ISSUE_ABORT_TERMINAL="$(create_issue \
  "stream-abort: [bug] Abort signal treated as stream delegation failure — failover retries after ESC" \
  "bug" \
  "$BODY_FILE")"
echo "Created #$ISSUE_ABORT_TERMINAL"

echo "Creating child 3/4: pre-delegation abort..."
cat >"$BODY_FILE" <<EOF
## Summary

Long work runs **before any events reach pi**, with no \`signal\` check:

- \`ensureFleetFresh()\` → \`rebuildFleet\`
- \`router.dispatch.dispatch()\` (HyDRA ONNX when enabled)
- \`resolvePlanningDelegatePath\` (extra full provider sub-call)

User cancel during these phases has no effect until delegation starts (if at all).

Parent tracking: #$ISSUE_TRACKING

## Environment

- pi-smart-router: \`$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)\`
- HyDRA enabled increases pre-delegation latency

## Steps to reproduce

1. \`/model smart-router/auto\` with HyDRA matcher loaded
2. Send prompt on a **tool_result** turn (post–read)
3. Press ESC during the silent period before streaming starts

## Expected

Early exit at phase boundaries when \`options?.signal?.aborted\`; optional \`signal.addEventListener('abort', ...)\` during active inner stream collection.

## Actual

No abort checks in \`route-and-delegate.ts\` before routing, fleet refresh, or planning delegate.

## Files

- \`.pi/extensions/smart-router/route-and-delegate.ts\`
- \`.pi/extensions/smart-router/delegate-stream.ts\`
- \`.pi/extensions/smart-router/planning-delegate.ts\`

## Acceptance criteria

- [ ] \`throwIfAborted(options)\` at top of \`routeAndDelegate\`, before \`ensureFleetFresh\`, before \`dispatch\`, before planning delegate, and at each failover loop iteration
- [ ] Unit test: abort during mocked slow \`dispatch\` — delegation never starts
- [ ] Document limitation: HyDRA/routing cannot cancel mid-ONNX unless matcher gains signal support (fail-fast before/after only)

## Verification

\`\`\`bash
npm run typecheck && npm test
\`\`\`

## Related

- #$ISSUE_ABORT_TERMINAL
- #$ISSUE_PIPING
EOF
ISSUE_PRE_DELEGATION="$(create_issue \
  "stream-abort: [bug] No abort checks before routing, fleet refresh, or planning delegate sub-call" \
  "bug" \
  "$BODY_FILE")"
echo "Created #$ISSUE_PRE_DELEGATION"

echo "Creating child 4/4: slash ctx.signal..."
cat >"$BODY_FILE" <<EOF
## Summary

\`/smart-router\` command handlers run long async work (\`refreshPricingCatalog\`, \`rebuildFleet\`, \`exportDatasetToFile\`, etc.) without \`ctx.signal\`. Pi extension docs recommend \`ctx.signal\` for cancellable nested work during active turns.

Secondary repro path when users or models invoke slash commands during a turn.

Parent tracking: #$ISSUE_TRACKING

## Environment

- pi-smart-router: \`$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)\`

## Steps to reproduce

1. During an active agent turn, invoke \`/smart-router pricing refresh\` (or export)
2. Press ESC while fetch/fleet rebuild runs

## Expected

Handler respects \`ctx.signal\`; \`fetch\` and long ops abort cleanly.

## Actual

\`.pi/extensions/smart-router/commands.ts\` does not pass or check \`ctx.signal\`.

## Files

- \`.pi/extensions/smart-router/commands.ts\`
- \`src/infrastructure/pricing/litellm-fetch.ts\` (if fetch options need extending)

## Acceptance criteria

- [ ] \`pricing refresh\` and \`export dataset\` respect abort when signal provided
- [ ] Unit or integration test with aborted signal during mocked slow fetch (if practical)
- [ ] Avoid partial fleet state updates on cancel where feasible

## Verification

\`\`\`bash
npm run typecheck && npm test
\`\`\`

## Related

- Lower priority than #$ISSUE_PIPING, #$ISSUE_ABORT_TERMINAL, #$ISSUE_PRE_DELEGATION
EOF
ISSUE_SLASH_SIGNAL="$(create_issue \
  "stream-abort: [enhancement] /smart-router commands should honor ctx.signal for cancellable async work" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_SLASH_SIGNAL"

echo "Updating tracking issue body with child links..."
TRACKING_BODY="$(mktemp)"
trap 'rm -f "$BODY_FILE" "$TRACKING_BODY"' EXIT
gh issue view "$ISSUE_TRACKING" --repo "$REPO" --json body -q .body >"$TRACKING_BODY"
python3 - <<PY
from pathlib import Path
import re
path = Path("$TRACKING_BODY")
text = path.read_text()
repl = """## Child issues

- [ ] #$ISSUE_PIPING — live event piping
- [ ] #$ISSUE_ABORT_TERMINAL — abort must not trigger failover
- [ ] #$ISSUE_PRE_DELEGATION — pre-delegation abort checks
- [ ] #$ISSUE_SLASH_SIGNAL — slash commands honor ctx.signal"""
text = re.sub(
    r"## Child issues\n\n<!--.*?-->\n\n(?:- \[ \].*\n)+",
    repl,
    text,
    count=1,
    flags=re.DOTALL,
)
path.write_text(text)
PY
gh issue edit "$ISSUE_TRACKING" --repo "$REPO" --body-file "$TRACKING_BODY"

echo "Commenting on tracking issue..."
gh issue comment "$ISSUE_TRACKING" --repo "$REPO" --body "$(cat <<EOF
Stream-abort child issues created:

- #$ISSUE_PIPING — live event piping
- #$ISSUE_ABORT_TERMINAL — abort must not trigger failover
- #$ISSUE_PRE_DELEGATION — pre-delegation abort checks
- #$ISSUE_SLASH_SIGNAL — slash commands honor \`ctx.signal\`

Suggested fix order: #$ISSUE_ABORT_TERMINAL → #$ISSUE_PIPING → #$ISSUE_PRE_DELEGATION → #$ISSUE_SLASH_SIGNAL (#$ISSUE_ABORT_TERMINAL + #$ISSUE_PIPING may ship together).

Created by \`scripts/github/create-stream-abort-issues.sh\`.
EOF
)"

cat >"$MANIFEST" <<EOF
# Created $(date -u +%Y-%m-%dT%H:%M:%SZ) by scripts/github/create-stream-abort-issues.sh
tracking=$ISSUE_TRACKING
live_piping=$ISSUE_PIPING
abort_terminal=$ISSUE_ABORT_TERMINAL
pre_delegation=$ISSUE_PRE_DELEGATION
slash_signal=$ISSUE_SLASH_SIGNAL
EOF

echo ""
echo "Done. Manifest: $MANIFEST"
echo "Tracking: https://github.com/$REPO/issues/$ISSUE_TRACKING"
