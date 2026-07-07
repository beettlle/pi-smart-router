# Task: SP-112 — HyDRA routing metadata prefix encoder

**Created:** 2026-07-07
**Size:** M

## Review Level: 1

**Assessment:** #60 — prefix HyDRA embed input with turn/tool/token metadata so requirement vectors reflect session context.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#60
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Create `buildHydraInput(request, triage?)` in `src/domain/matching/hydra-input.ts` that prefixes `prompt_text` with `[turns:N|tools:0|tokens:N|type:...]` metadata. Wire into `HydraMatcher.match()` replacing raw prompt embedding. Document that metadata affects capability prediction only; tier selection remains cluster/feature gate (#58). Same short prompt with different `estimated_input_tokens` must produce different requirement vectors.

## Dependencies

- SP-091

## Context to Read First

- `src/domain/matching/hydra-matcher.ts`
- `src/domain/types/entities.ts` — `RoutingRequest`
- `tests/unit/hydra-matcher.test.ts`
- `specs/001-build-smart-router/data-model.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/hydra-input.ts` |
| May change | `src/domain/matching/hydra-matcher.ts`, `tests/unit/hydra-matcher.test.ts`, `specs/001-build-smart-router/data-model.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/matching/hydra-input.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | HyDRA embeds prefixed input; token count changes requirement vectors; regression tests pass; prefix format documented; within 80–120ms budget. |

## Steps

### Step 1: Metadata prefix builder

- [ ] Create `hydra-input.ts` with `buildHydraInput(request, triage?)`
- [ ] Include turns, tools, tokens, turn_type flags per issue spec
- [ ] Unit tests for prefix format and edge cases

### Step 2: Wire into HyDRA matcher

- [ ] Replace `request.prompt_text` with `buildHydraInput(request)` in `HydraMatcher.match()`
- [ ] Regression tests for existing coding-prompt HyDRA behavior
- [ ] Document tier vs capability head separation in data-model.md

### Step 3: Testing and verification

- [ ] Test: same prompt, high vs low `estimated_input_tokens` → different requirement vectors
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] HyDRA embeds prefixed input, not raw prompt alone
- [ ] Same short prompt with high vs low `estimated_input_tokens` produces different requirement vectors
- [ ] Regression tests for existing HyDRA matcher behavior on coding prompts
- [ ] Prefix format documented in `specs/001-build-smart-router/data-model.md`
- [ ] Budget still within 80–120ms (prefix adds negligible embed cost)
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-112): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
