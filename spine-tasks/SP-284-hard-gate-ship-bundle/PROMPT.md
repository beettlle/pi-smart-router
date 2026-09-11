# Task: SP-284 — hard-gate ship bundle

**Created:** 2026-09-10
**Size:** M

## Review Level: 1

**Assessment:** Post-1.0 calibration follow-up; bounded file scope.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#168
- Release: v1.1.0
- Manifest: `spine-tasks/_authoring/release-v1.1.0/manifest.md`

## Mission

If hard gates pass, ship candidate `config/routing-calibration.json` + `config/p-success-weights.json` and sync README/migration. If gates fail, keep honest-untrained and document.

## Dependencies

- SP-283

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `spine-tasks/_authoring/release-v1.1.0/manifest.md`
- `docs/migration-v1.md` (honest-untrained 1.0 posture)
- Issue beettlle/pi-smart-router#168

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/routing-calibration.json`, `config/p-success-weights.json`, `docs/migration-v1.md`, `spine-tasks/_authoring/release-v1.1.0/hard-gate-ship-note.md` |
| May change | `README.md` (cross-links only — already touched by SP-281/SP-285) |
| Must NOT change | frugality defaults, encoder defaults (#96) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1 npm run release:check` |
| fileScopeMustChange | `config/routing-calibration.json`, `config/p-success-weights.json`, `docs/migration-v1.md`, `spine-tasks/_authoring/release-v1.1.0/hard-gate-ship-note.md` |
| completionCriteria | Mission outcomes met; STATUS honest |

## Steps

### Step 0: Preflight

- [ ] Read CONTEXT + linked issue + migration honesty section
- [ ] Confirm v1.0 neutralize still in place until SP-284 ships trained artifacts

### Step 1: Implementation

- [ ] Deliver mission outcomes within File Scope

### Step 2: Testing & Verification

- [ ] Run contract testCommand
- [ ] Update STATUS with evidence


## Do NOT

- Ship when hard ECE / y_span gates fail
- Flip encoder or frugality defaults (#96 / #95)

## Completion Criteria

- [ ] Mission complete without inventing labels or flipping #96 defaults

## Amendments

- **2026-09-11 (pre-land redirect):** SP-281/SP-285 already edited `README.md` on `main`. Contract `fileScopeMustChange` redirected away from README to new `spine-tasks/_authoring/release-v1.1.0/hard-gate-ship-note.md`. README remains May-change for cross-links only.
