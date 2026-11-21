# Task: SP-322 — Model repeated non-infra failure counter + in-turn failover

**Created:** 2026-11-19
**Size:** M

## Review Level: 2

**Assessment:** Session-scoped model_repeated_failure counter with in-turn selectFailover and request-caused safeguards.
**Score:** 6/8 — Blast radius: 2, Pattern novelty: 2, Security: 0, Reversibility: 2

## Source

- GitHub: beettlle/pi-smart-router#194
- Release: v1.5.0
- Bucket: bug
- Closes: #194

## Mission

After SP-320/SP-321, intermittent 400 / truncated streams still need a **non-infra** failure counter and same-turn failover so pi auto-retry does not re-pick the broken model.

1. Count consecutive non-infra failures per model (4xx outside #37/#158/#159 / context-overflow carve-outs; truncated streams with no finish_reason / zero output).
2. At threshold, open breaker with reason `model_repeated_failure` + half-open recovery (defaults maintainer-chosen; document in STATUS).
3. Fail over inside the turn via existing `selectFailover`.
4. Safeguards: never exclude last healthy model in tier; if alternate fails with same 4xx class, treat as request-caused and do not count against the first model; Gemini thought_signature 400 must not count.
5. Telemetry: distinct reason visible in status/history.

Prefer sharing a session-scoped penalty primitive that #181 (SP-325) can reuse.

## Dependencies

- SP-320
- SP-321

## Context to Read First

- Issue #194 Proposed fix 4–8 + tests e/f/g
- `src/infrastructure/gateway/gateway-dispatch.ts` (CircuitBreaker / selectFailover)
- `.pi/extensions/smart-router/route-and-delegate.ts`, `delegate-stream.ts`
- Related closed issues #3, #37, #159

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/gateway/gateway-dispatch.ts`, `tests/unit/gateway-dispatch.test.ts` |
| May change | `.pi/extensions/smart-router/route-and-delegate.ts`, `.pi/extensions/smart-router/delegate-stream.ts`, `tests/unit/smart-router-extension.test.ts`, `src/domain/types/entities.ts`, `tests/unit/provider-error.test.ts` |
| Must NOT change | `src/domain/pipeline/`, `package.json`, `README.md`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/gateway-dispatch.test.ts tests/unit/smart-router-extension.test.ts && bash scripts/spine-stet-contract-run.sh default SP-322` |
| fileScopeMustChange | `src/infrastructure/gateway/gateway-dispatch.ts`, `tests/unit/gateway-dispatch.test.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/`, `package.json`, `.review/` |
| completionCriteria | Threshold exclusion + recovery; thought_signature excluded; last model never excluded; in-turn failover; tests e/f/g green; #194 closable |

## Steps

### Step 0: Preflight

- [ ] Inventory CircuitBreaker APIs and selectFailover call sites
- [ ] Decide threshold/reset defaults; record in STATUS Discoveries

### Step 1: Counter + open reason

- [ ] Implement model_repeated_failure counting + half-open recovery
- [ ] Request-caused / last-model / thought_signature safeguards

### Step 2: In-turn failover + telemetry

- [ ] Wire selectFailover on counted failures
- [ ] Expose reason in status/history telemetry

### Step 3: Testing & Verification

- [ ] Tests e/f/g from #194
- [ ] Run Contract `testCommand`
- [ ] Call `spine_review_step` after each implementation step

## Do NOT

- Degenerate length+repetition detection (#181 / SP-325)
- Permanent model bans

## Completion Criteria

- [ ] #194 closed by this packet + SP-320/SP-321
- [ ] Contract green

## Git Commit Convention

`fix(SP-322): model repeated failure failover (#194)`

## Amendments

- **2026-11-20 (preflight / pre-landed file scope):** SP-321 already changed `.pi/extensions/smart-router/route-and-delegate.ts` and `delegate-stream.ts` on main. Redirected `fileScopeMustChange` / File Scope Must change to `gateway-dispatch.ts` + `gateway-dispatch.test.ts` (model_repeated_failure counter delivery). Extension wiring remains May change.
