# Task: SP-325 — Degenerate output detect (length + no toolCall + repetition) → failover

**Created:** 2026-11-19
**Size:** M

## Review Level: 2

**Assessment:** Post-stream degenerate detection on length stops with repetitive text; mark unhealthy and fail over.
**Score:** 6/8 — Blast radius: 2, Pattern novelty: 2, Security: 0, Reversibility: 2

## Source

- GitHub: beettlle/pi-smart-router#181
- Epic: beettlle/pi-smart-router#182
- Release: v1.5.0
- Bucket: feature
- Closes: #181
- Partial: #182

## Mission

Detect degenerate delegated turns when **all** hold:

- `stopReason === "length"`
- no `toolCall` blocks
- high repetition on trailing text (n-gram / compression / repeated line threshold — pick one, document defaults)

Response:

1. Treat as failure; telemetry `reason_code = degenerate_output`
2. Mark model unhealthy for session (reuse SP-322 penalty primitive when available)
3. Fail over via `selectFailover`; retry without the bad turn
4. If no failover, return a short structured error — never dump 8k junk

Optional mid-stream abort is nice-to-have; not required for close. Do **not** rely on typed_judgment (OpenJev missed the sleep-loop case).

## Dependencies

- SP-322

## Context to Read First

- Issue #181 AC
- `.pi/extensions/smart-router/delegate-stream.ts`, `route-and-delegate.ts`
- SP-322 session penalty / breaker APIs on main after integrate
- #52 (related length-stop headroom — opposite case)

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/delegate-stream.ts`, `.pi/extensions/smart-router/route-and-delegate.ts`, `src/domain/delegation/degenerate-output.ts`, `tests/unit/degenerate-output.test.ts` |
| May change | `src/infrastructure/gateway/gateway-dispatch.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/`, `package.json`, `README.md`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts tests/unit/degenerate-output.test.ts && bash scripts/spine-stet-contract-run.sh default SP-325` |
| fileScopeMustChange | `.pi/extensions/smart-router/delegate-stream.ts`, `tests/unit/degenerate-output.test.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/`, `package.json`, `.review/` |
| completionCriteria | Synthetic repetitive length stop classified; long non-repetitive length stop not; failover + degenerate_output telemetry; #181 closable |

## Steps

### Step 0: Preflight

- [ ] Read SP-322 penalty APIs after integrate
- [ ] Choose repetition metric + thresholds; record in STATUS

### Step 1: Detector + failover

- [ ] Pure classifier + unit fixtures
- [ ] Wire post-stream check → penalty → selectFailover

### Step 2: Testing & Verification

- [ ] Unit AC from #181
- [ ] Integration: failover + telemetry reason
- [ ] Run Contract `testCommand`
- [ ] Call `spine_review_step` after each implementation step

## Do NOT

- Invent judgment-based degenerate detection
- Dispatch repetitive toolCall args (optional follow-on)

## Completion Criteria

- [ ] #181 closed; #182 closable when #179 also closed
- [ ] Contract green

## Git Commit Convention

`feat(SP-325): degenerate output failover (#181)`
