# Task: SP-141 — Consumer pack extension bootstrap verify

**Created:** 2026-07-09
**Size:** S

## Review Level: 1

**Assessment:** #86 part 2 — extend release consumer-pack verify to import extension bootstrap from a clean temp project dir.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#86
- Release: v0.4.0 Delegate
- Bucket: bug

## Mission

Extend `scripts/verify-consumer-pack.sh` so CI catches extension bootstrap failures masked by dev-repo dogfooding. After `npm install --omit=dev` in a temp unpack dir, run from a **separate** empty project directory (no dev `node_modules`) and dynamically import `.pi/extensions/smart-router/pi-model-scope.ts` (or equivalent bootstrap entry) to prove consumer resolution works.

## Dependencies

- SP-140

## Context to Read First

- `scripts/verify-consumer-pack.sh`
- `.github/workflows/release.yml`
- `.pi/extensions/smart-router/pi-model-scope.ts`
- Issue #86 suggested fix #3 (CI gap)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/verify-consumer-pack.sh` |
| May change | `package.json` (`release:consumer-pack` script if needed) |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run release:consumer-pack` |
| fileScopeMustChange | `scripts/verify-consumer-pack.sh` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Consumer pack script fails on pre-SP-140 resolution bug; passes after SP-140 fix; release workflow unchanged except stronger verify. |

## Steps

### Step 1: Temp project bootstrap check

- [ ] Create empty temp project dir outside packed tarball tree
- [ ] Import pi-model-scope (or index bootstrap) from installed pack path
- [ ] Assert resolveModelScope loads without repo dev deps

### Step 2: Testing and verification

- [ ] Run `npm run release:consumer-pack`
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `verify-consumer-pack.sh` covers extension bootstrap from clean cwd
- [ ] `npm run release:consumer-pack` passes
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `fix(SP-141): description`

## Do NOT

- Re-implement pi-model-scope resolution (SP-140)

---
