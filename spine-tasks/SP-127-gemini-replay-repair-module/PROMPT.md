# Task: SP-127 — Gemini Replay Repair Module

**Created:** 2026-07-08
**Size:** S

## Review Level: 2

**Assessment:** Protocol/API boundary — repair Gemini tool-call replay state before pi-ai delegation without forking pi-ai.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#85
- Related: beettlle/pi-smart-router#37, beettlle/pi-smart-router#38
- Upstream: [earendil-works/pi#6342](https://github.com/earendil-works/pi/issues/6342) (closed — not planned)
- Release: v0.2.0
- Bucket: feature

## Mission

Add pure domain replay repair in `src/domain/delegation/delegation-context.ts` so cross-model Gemini delegation preserves or substitutes `thoughtSignature` on tool-call replay.

pi-ai strips `thoughtSignature` when assistant message model ≠ target model. Smart-router must:

1. Export `GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL` (verify wire format against `@earendil-works/pi-ai@0.80.3` Google serializer in Step 1 — plain string vs base64; document choice in code comment).
2. Add `isGoogleDelegationTarget(model)` helper.
3. Add `repairGeminiReplayContext(context, targetModel, sessionExecution?)` composed after existing `normalizeDelegationContext` logic:
   - Google-target delegation only.
   - Rewrite **Google-origin** assistant messages (virtual-router, `google`/`gemini` providers) to **target model** identity so pi-ai `isSameModel` passes.
   - For each `toolCall` missing `thoughtSignature`, inject sentinel per [Google thought signatures docs](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).
   - Do **not** rewrite OpenAI/Anthropic assistant messages.

Export shared Google-origin detectors (`isGoogleOriginAssistantMessage` or equivalent) for SP-129 guard narrowing.

## Dependencies

- SP-075 (landed — terminal error classification baseline)
- SP-077 (landed — blunt guard baseline; replaced in SP-129)

## Context to Read First

- `src/domain/delegation/delegation-context.ts` — existing `normalizeDelegationContext`, `hasReplaySensitiveState`
- `tests/unit/delegation-context.test.ts`
- `node_modules/@earendil-works/pi-ai/dist/**` — Google message serializer (sentinel wire format spike)
- `.pi/extensions/smart-router/delegation-runtime.ts` — `buildDelegationContext` (read-only; wired in SP-128)
- Upstream: [earendil-works/pi#6342](https://github.com/earendil-works/pi/issues/6342)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/delegation/delegation-context.ts`, `tests/unit/delegation-context.test.ts` |
| May change | `src/index.ts` (re-export new helpers if needed) |
| Must NOT change | `.pi/extensions/smart-router/**`, `src/domain/routing/tool-history-guard.ts`, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/delegation/delegation-context.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/delegation-runtime.ts`, `src/domain/routing/tool-history-guard.ts` |
| completionCriteria | Unit tests cover signature preserved, sentinel injected when absent, cross-model identity alignment, non-Google messages untouched; sentinel wire format documented. |

## Testing

- Unit: `tests/unit/delegation-context.test.ts` — repair and detector cases
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Sentinel format spike

- [ ] Read pi-ai Google serializer for `thoughtSignature` / `thought_signature` wire format
- [ ] Document chosen sentinel value in code comment (`skip_thought_signature_validator` or base64 variant)

### Step 2: Implement repair helpers

- [ ] Add `isGoogleDelegationTarget`, Google-origin assistant detector
- [ ] Implement `repairGeminiReplayContext` composing with `normalizeDelegationContext`

### Step 3: Unit tests

- [ ] Signature preserved when present on toolCall
- [ ] Sentinel injected when absent
- [ ] Cross-model identity aligned to target model
- [ ] OpenAI/Anthropic assistant messages unchanged

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] `repairGeminiReplayContext` exported and unit-tested
- [ ] Google-origin detector exported for SP-129
- [ ] No extension or routing guard changes in this task
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-127): description`

## Do NOT

- Wire repair in `delegation-runtime.ts` (SP-128 scope)
- Change tool-history guard semantics (SP-129 scope)
- Fork pi-ai or add direct Google API client

---

## Amendments (Added During Execution)
