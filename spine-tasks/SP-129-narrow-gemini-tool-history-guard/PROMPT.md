# Task: SP-129 — Narrow Gemini Tool-History Guard

**Created:** 2026-07-08
**Size:** M

## Review Level: 2

**Assessment:** Replace blunt SP-077 exclusion with Google-origin replay risk detector; align SP-080 deprioritize logic.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#85
- Supersedes semantics: beettlle/pi-smart-router#38 (SP-077)
- Release: v0.2.0
- Bucket: feature

## Mission

Replace blunt SP-077 behavior in `src/domain/routing/tool-history-guard.ts`:

| Current | Target |
|---------|--------|
| `hasToolCallHistory` → exclude all Gemini | `hasGoogleReplayRisk(messages)` → exclude Gemini only when history contains Google-origin assistant toolCall blocks |
| OpenAI tool session → Gemini blocked | OpenAI tool session → Gemini **allowed** |

Once SP-128 repair exists, **remove hard exclusion for Google-origin tool history** — rely on delegation replay repair instead. Keep `gemini_tool_history_excluded` telemetry and SP-084 empty-fleet fail-safe only for cases repair cannot cover (document edge cases in tests).

Update `src/domain/pipeline/router-pipeline.ts` SP-080 `prioritizeFleetForToolHistory` to use the same narrowed detector (import shared helper from SP-127 or tool-history-guard — do not duplicate divergent logic).

Reuse Google-origin detector exported from SP-127 where possible.

## Dependencies

- **Task:** SP-127

## Context to Read First

- `src/domain/routing/tool-history-guard.ts` — SP-077, SP-084
- `src/domain/pipeline/router-pipeline.ts` — `prioritizeFleetForToolHistory` (SP-080)
- `src/domain/delegation/delegation-context.ts` — SP-127 Google-origin detector
- `tests/unit/tool-history-guard.test.ts`
- `tests/unit/smart-router-extension.test.ts` — SP-077 describe block

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/tool-history-guard.ts`, `tests/unit/tool-history-guard.test.ts`, `src/domain/pipeline/router-pipeline.ts` (SP-080 block only) |
| May change | `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/delegation-runtime.ts` (SP-128), `src/infrastructure/gateway/circuit-breaker.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/routing/tool-history-guard.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/delegation-runtime.ts`, `src/infrastructure/gateway/circuit-breaker.ts` |
| completionCriteria | OpenAI tool history does not exclude Gemini; Google-origin replay risk uses repair path not blunt ban; SP-080 deprioritize uses same detector; tests updated. |

## Testing

- Unit: `tests/unit/tool-history-guard.test.ts` — narrowed guard cases
- Unit: router-pipeline deprioritize if applicable
- Extension: update SP-077 tests — OpenAI tool history routes to Gemini when economical
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Narrow replay-risk detector

- [ ] Add `hasGoogleReplayRisk` (or equivalent) using SP-127 Google-origin helpers
- [ ] Replace `hasToolCallHistory` usage in `resolveEffectiveFleet` with narrowed detector
- [ ] Remove hard Gemini exclusion when repair path applies (post SP-128 design)

### Step 2: Align SP-080 deprioritize

- [ ] Update `prioritizeFleetForToolHistory` to use same detector
- [ ] Keep deprioritize semantics for residual Google replay risk if any

### Step 3: Tests

- [ ] OpenAI tool history + Gemini in fleet → Gemini not excluded
- [ ] Update extension tests that assumed SP-077 blunt exclusion
- [ ] SP-084 empty-fleet behavior still correct for edge cases

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] OpenAI-only tool sessions can route to economical Gemini
- [ ] Google tool sessions rely on SP-128 repair, not blunt ban
- [ ] Telemetry reason code preserved where exclusion still applies
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-129): description`

## Do NOT

- Revert SP-075 thought_signature terminal error classification
- Change delegation repair logic (SP-127/128)
- Block all Google models globally

---

## Amendments (Added During Execution)
