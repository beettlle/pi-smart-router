# Task: SP-251 — Missing-weights reason codes (HyDRA + K4)

**Created:** 2026-09-02
**Size:** S

## Review Level: 1

**Assessment:** Surface hydra_weights_missing / k4_heads_placeholder in decision metadata when placeholders are used — not stderr-only.
**Score:** 3/8 — Blast radius: 2 (matchers + decision metadata), Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#148
- Bucket: feature
- Partial: #148 (fail_closed + sandwich is SP-252)
- Release: v0.21.0
- Manifest: `spine-tasks/_authoring/release-v0.21.0/manifest.md`

## Mission

Partial #148 — make **missing HyDRA / ModernBERT K4 weights explicit** in routing decision metadata:

1. When `resolveHydraProjectionWeights` / `resolveModernBertK4HeadWeights` fall back to placeholders, emit stable reason codes: `hydra_weights_missing`, `k4_heads_placeholder` (shared constants OK).
2. Plumb codes into decision / explain sidecar metadata (not only `console.warn`).
3. Keep placeholder behavior as default (fail-open) — do **not** implement `fail_closed_on_missing_weights` here (SP-252).
4. Unit tests in `hydra-matcher` + `modernbert-heads` suites: missing artifact → placeholder path + explicit reason present.
5. Do **not** flip `modernbert_k4` defaults (#96). Do **not** edit README reason-code table (SP-253).

## Dependencies

- **None**

## Context to Read First

- Issue #148 body — reason codes + evidence lines
- `Parent split: SP-251/252 — #148 degraded weights`
- `src/domain/matching/hydra-matcher.ts` (~172–183 placeholder)
- `src/domain/matching/modernbert-heads.ts` (~176–188 placeholder)
- Existing degraded sandwich reason-code style in `src/domain/routing/degraded-route-sandwich.ts`
- `tests/unit/hydra-matcher.test.ts`, `tests/unit/modernbert-heads.test.ts`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/hydra-matcher.ts`, `src/domain/matching/modernbert-heads.ts` |
| May change | decision/types under `src/domain/types/**`, shared reason-code constants module under `src/domain/matching/` or `src/domain/routing/`, `tests/unit/hydra-matcher.test.ts`, `tests/unit/modernbert-heads.test.ts` |
| Must NOT change | operator `fail_closed` config (SP-252), `README.md` (SP-253), `package.json` (version), `#96` default flip |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/hydra-matcher.test.ts tests/unit/modernbert-heads.test.ts` |
| fileScopeMustChange | `src/domain/matching/hydra-matcher.ts`, `src/domain/matching/modernbert-heads.ts` |
| fileScopeMustNotChange | `README.md`, `package.json` |
| completionCriteria | Missing weights emit hydra_weights_missing / k4_heads_placeholder into decision metadata; unit tests cover both; placeholders still default |

## Steps

### Step 0: Preflight

- [ ] Locate placeholder fallback sites + decision metadata shape

### Step 1: Reason codes in matchers

- [ ] Add shared constants for the two reason codes
- [ ] Emit codes into decision/explain metadata on placeholder path
- [ ] Keep stderr warn optional/additive — metadata is required

### Step 2: Testing & Verification

- [ ] Unit tests for both HyDRA and K4 missing-artifact paths
- [ ] Contract `testCommand` green

## Completion Criteria

- [ ] Reason codes landed; Partial #148

## Do NOT

- Implement fail-closed config (SP-252)
- Flip modernbert_k4 defaults (#96)
- Edit README (SP-253)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-251): missing-weights reason codes (#148)`

## Amendments

- None
