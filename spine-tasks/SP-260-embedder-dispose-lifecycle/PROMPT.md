# Task: SP-260 — Real embedder dispose() + lifecycle tests

**Created:** 2026-09-04
**Size:** S

## Review Level: 1

**Assessment:** Replace no-op embedder dispose with real ONNX session release and prove it in tests.
**Score:** 3/8 — Blast radius: 2 (embedder lifecycle), Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#147
- Bucket: feature
- Closes: #147 (with SP-259+SP-261 docs)
- Release: v0.22.0
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`

## Mission

Close #147 lifecycle half — implement **real** `TextEmbedder.dispose()`:

1. Release ONNX / transformers session handles (not a no-op comment). If upstream offers no dispose API, release the strongest available handle/ref and document the residual risk in STATUS — still must not leave a silent empty `dispose()` pretending to free resources.
2. Coordinate dispose with HyDRA matcher / shared embedder factory callers as needed for safe shutdown.
3. Unit tests prove dispose is invoked and post-dispose embed fails closed or recreates cleanly (choose one and document).
4. Do **not** change digest pin logic except minimal hooks (SP-259 owns pins). Do **not** write README supply-chain section (SP-261).

## Dependencies

- **SP-259**

## Context to Read First

- SP-259 STATUS — pin/load path
- `src/domain/matching/embedding-provider.ts` dispose stub
- Callers of `dispose()` / embedder lifecycle
- Issue #147 verification commands

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/embedding-provider.ts`, `tests/unit/embedding-provider.test.ts` |
| May change | `src/domain/matching/hydra-matcher.ts`, shared embedder wiring, `tests/unit/hydra-matcher.test.ts` |
| Must NOT change | `.pi/extensions/smart-router`, `README.md` (SP-261/262), `vitest.config.ts` (SP-258), `package.json` version field |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/embedding-provider.test.ts tests/unit/hydra-matcher.test.ts` |
| fileScopeMustChange | `tests/unit/embedding-provider.test.ts` |
| fileScopeMustNotChange | `README.md`, `package.json`, `.pi/extensions/smart-router` |
| completionCriteria | dispose releases resources (or documented strongest available release); lifecycle tests prove dispose; Closes #147 with SP-261 |

## Steps

### Step 0: Preflight

- [ ] Inspect current dispose stub + upstream API options
- [ ] Identify callers that must invoke dispose

### Step 1: Real dispose

- [ ] Implement resource release path
- [ ] Wire callers if needed for shutdown

### Step 2: Testing & Verification

- [ ] Lifecycle unit tests
- [ ] Contract `testCommand` green

## Completion Criteria

- [ ] Real dispose landed; #147 closable after SP-261 docs

## Do NOT

- Leave empty no-op dispose with apologetic comment only
- Write README supply-chain section (SP-261)
- Flip encoder defaults (#96/#167)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-260): real embedder dispose lifecycle (#147)`

## Amendments

- **2026-09-05 (pre-land redirect):** SP-259 already landed digest-pin edits in `src/domain/matching/embedding-provider.ts` on `main`. Contract `fileScopeMustChange` redirected to `tests/unit/embedding-provider.test.ts` (dispose lifecycle proof). Implementation still **Must change** `embedding-provider.ts` (replace no-op `dispose()`).
