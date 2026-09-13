# Task: SP-292 — cascading embedder + telemetry

**Created:** 2026-09-12
**Size:** M

## Review Level: 1

**Assessment:** Lazy dual-session cascading embedder with degrade-never-mix fallback (#173 part 2).
**Score:** 5/8 — Blast radius: 4, Pattern novelty: 2, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#173
- Release: v1.2.0
- Bucket: feature
- Partial: #173 (embedder + telemetry; centroids in SP-293)

## Mission

Implement `createCascadingTextEmbedder` that lazily owns MiniLM + Granite sessions, selects via SP-291 gate, and falls back to MiniLM with explicit reason code when Granite/artifacts unavailable. Wire decision telemetry fields (`encoder_selected`, `token_estimate`, cascade threshold / fallback). Keep `createTextEmbedder` behavior when cascade disabled.

## Dependencies

- SP-291

## Context to Read First

- Issue beettlle/pi-smart-router#173
- `src/domain/matching/embedding-provider.ts`
- `src/domain/matching/encoder-gate.ts` (from SP-291)
- `src/domain/matching/hydra-matcher.ts`
- SP-252 fail-closed / degrade precedents

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/embedding-provider.ts` |
| May change | `src/domain/matching/hydra-matcher.ts`, `tests/unit/embedding-provider.test.ts`, telemetry/sidecar types under `src/domain/**` |
| Must NOT change | `config/operator-config.json.example` defaults (cascade stays off), `.github/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/embedding-provider.test.ts tests/unit/encoder-gate.test.ts` |
| fileScopeMustChange | `src/domain/matching/embedding-provider.ts`, `tests/unit/embedding-provider.test.ts` |
| fileScopeMustNotChange | `.github/` |
| completionCriteria | Cascading embedder + tests for selection/lazy load/fallback/dispose; telemetry fields present when cascade enabled |

> **In-lane note:** Full `npm run verify:ci` / `release:check` are post-integrate gates on `main`. Do not use them as Contract `testCommand` — coverage flaked on unrelated `train-routing-calibration` timeout under load (`excludes legacy-prefix embedding rows`, #161-class).

## Steps

### Step 0: Preflight

- [ ] Confirm SP-291 gate API
- [ ] Map current `createTextEmbedder` / dispose patterns

### Step 1: Cascading embedder

- [ ] `createCascadingTextEmbedder` with lazy Granite load
- [ ] Fallback to MiniLM + reason code; never mix spaces
- [ ] `dispose()` closes both sessions

### Step 2: Wiring + telemetry

- [ ] Use cascade path only when config enabled
- [ ] Emit `encoder_selected` / `token_estimate` / fallback reason on sidecar

### Step 3: Testing & Verification

- [ ] Unit/integration tests for selection, lazy load, fallback, dispose
- [ ] Run Contract `testCommand` (typecheck + scoped vitest); full `verify:ci` is post-integrate on `main`

## Do NOT

- Enable cascade by default
- Reuse MiniLM-trained projection weights for Granite vectors
- Implement centroid bootstrap (SP-293)

## Completion Criteria

- [ ] Cascading embedder + telemetry + tests; single-encoder path unchanged when disabled
