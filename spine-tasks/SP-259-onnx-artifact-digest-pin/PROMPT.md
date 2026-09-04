# Task: SP-259 — Pin ONNX artifacts by SHA-256 + verify on load

**Created:** 2026-09-04
**Size:** S

## Review Level: 1

**Assessment:** Pin MiniLM/Granite ONNX artifacts by digest and fail closed when configured pins mismatch or are missing.
**Score:** 4/8 — Blast radius: 2 (embedder load path), Pattern novelty: 1, Security: 2, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#147
- Bucket: feature
- Partial: #147 (dispose is SP-260; supply-chain docs SP-261)
- Release: v0.22.0
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`

## Mission

Partial #147 — **digest-pin ONNX artifacts** used by the embedder:

1. Add SHA-256 digests for MiniLM (`Xenova/all-MiniLM-L6-v2`) and Granite ONNX artifacts in config (operator config / dedicated pin file — choose one and document in STATUS).
2. On load, verify cached artifact digests when pins are configured; **fail closed** on mismatch or missing required pin in CI/prod-pin mode.
3. Keep first-run download behavior for unpinned local dogfood unless pin mode is enabled — do not silently skip verification when pins are present.
4. Unit tests cover verify-success and fail-closed mismatch paths (fixture digests OK).
5. Do **not** implement real `dispose()` here (SP-260). Do **not** flip encoder defaults (#96/#167). Do **not** write README supply-chain section (SP-261).

## Dependencies

- **None**

## Context to Read First

- Issue #147 body
- `src/domain/matching/embedding-provider.ts`
- Operator config schema for hydra / artifact cache
- Existing embedder / hydra-matcher unit tests

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None (tests use fixtures; no live HF required)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/embedding-provider.ts` |
| May change | config schema under `src/config`, `config/operator-config.json.example`, pin digest constants/file under `config/`, `tests/unit/embedding-provider.test.ts`, `tests/unit/hydra-matcher.test.ts` |
| Must NOT change | dispose implementation beyond hooks needed for later SP-260, `.pi/extensions/smart-router`, `README.md` (SP-261/262), `package.json` version field, encoder default flip |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/embedding-provider.test.ts` |
| fileScopeMustChange | `src/domain/matching/embedding-provider.ts` |
| fileScopeMustNotChange | `README.md`, `package.json`, `.pi/extensions/smart-router` |
| completionCriteria | Digest pins verified on load when configured; fail closed on mismatch; unit tests cover success + failure; Partial #147 |

## Steps

### Step 0: Preflight

- [ ] Locate download/cache path + model ids for MiniLM and Granite
- [ ] Choose pin config location (STATUS note)

### Step 1: Digest pin + verify

- [ ] Add digests + verify-on-load
- [ ] Fail closed when pins configured and mismatch/missing
- [ ] Preserve unpinned dogfood download unless pin mode on

### Step 2: Testing & Verification

- [ ] Unit tests for verify success + fail-closed
- [ ] Contract `testCommand` green

## Completion Criteria

- [ ] Pins landed; Partial #147

## Do NOT

- Implement real dispose (SP-260)
- Write supply-chain README (SP-261)
- Flip encoder defaults (#96/#167)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-259): pin ONNX artifacts by digest (#147)`

## Amendments

- None
