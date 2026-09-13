# Task: SP-291 — encoder cascade config + gate

**Created:** 2026-09-12
**Size:** M

## Review Level: 1

**Assessment:** Opt-in encoder cascade schema + pure token-threshold gate (#173 part 1).
**Score:** 4/8 — Blast radius: 3, Pattern novelty: 2, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#173
- Release: v1.2.0
- Bucket: feature
- Partial: #173 (config + gate; embedder in SP-292)

## Mission

Add opt-in `hydra.encoder_cascade` config (**default off**) and a pure `selectEncoderForPrompt` gate that reuses the turn-envelope token estimator. Existing single-encoder installs must be unaffected.

## Dependencies

- SP-289

## Context to Read First

- Issue beettlle/pi-smart-router#173
- `src/domain/types/schemas.ts` (`EncoderSchema`, hydra config)
- `src/domain/pipeline/turn-envelope-stage.ts` (token estimator)
- `src/domain/matching/embedding-provider.ts`
- `config/operator-config.json.example`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/schemas.ts`, `src/domain/matching/encoder-gate.ts` (new), `tests/unit/encoder-gate.test.ts` (new) |
| May change | `config/operator-config.json.example`, `src/config/defaults.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `.github/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/encoder-gate.test.ts` |
| fileScopeMustChange | `src/domain/types/schemas.ts`, `src/domain/matching/encoder-gate.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Cascade config default off; gate unit tests cover threshold/disabled/estimator parity |

> **Contract note (wave-1 retry):** Scoped typecheck + encoder-gate unit tests. Full
> `verify:ci` / `release:check` remain post-integrate gates — prior attempt exited
> mid-`verify:ci` before `.DONE`.

## Steps

### Step 0: Preflight

- [ ] Read #173 design + turn-envelope estimator
- [ ] Confirm no cascade fields already exist

### Step 1: Schema + defaults

- [ ] Add `EncoderCascadeConfig` (enabled false; long_context_encoder granite; token_threshold 512)
- [ ] Document in `config/operator-config.json.example` without flipping defaults

### Step 2: Gate + tests

- [ ] Implement `selectEncoderForPrompt` with reason codes from #173
- [ ] Unit tests: boundaries, disabled, estimator parity with turn-envelope

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand` (`npm run typecheck && npx vitest run tests/unit/encoder-gate.test.ts`)
- [ ] Optionally run `npm run verify:ci` if time allows; otherwise rely on post-integrate `release:check`

## Do NOT

- Implement cascading embedder (SP-292)
- Flip default encoder or enable cascade by default
- Mix encoder vector spaces

## Completion Criteria

- [ ] Schema + gate + tests landed; cascade default off
