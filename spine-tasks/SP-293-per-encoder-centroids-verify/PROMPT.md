# Task: SP-293 — per-encoder centroids + calibration verify

**Created:** 2026-09-12
**Size:** M

## Review Level: 1

**Assessment:** Granite-flavored centroid artifact path + reject cross-encoder mixes (#173 part 3).
**Score:** 4/8 — Blast radius: 3, Pattern novelty: 2, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#173
- Release: v1.2.0
- Bucket: feature
- Partial: #173 (artifacts; docs/eval in SP-294)

## Mission

Extend centroid bootstrap with `--encoder granite` (namespaced artifact). Granite-side learned projection stays honest-untrained (`trained_sample_count: 0`). `verify-routing-calibration` must reject bundles that mix encoder flavors.

## Dependencies

- SP-292

## Context to Read First

- Issue beettlle/pi-smart-router#173
- `scripts/bootstrap-routing-centroids.ts`
- `scripts/verify-routing-calibration.ts`
- `config/routing-centroids.json` (MiniLM baseline)
- SP-252 fail-closed precedent

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/bootstrap-routing-centroids.ts`, `scripts/verify-routing-calibration.ts` |
| May change | `tests/unit/**` for verify/bootstrap, `package.json` script help text only if needed |
| Must NOT change | Shipped MiniLM defaults / flip cascade on, `.github/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/train-routing-calibration.test.ts -t "verifyRoutingCalibration|OATS|rejects"` |
| fileScopeMustChange | `scripts/bootstrap-routing-centroids.ts`, `scripts/verify-routing-calibration.ts` |
| fileScopeMustNotChange | `.github/` |
| completionCriteria | `--encoder granite` emits flavored artifact; verify rejects cross-encoder mixes; Granite projection honest-untrained |

> **In-lane note:** Prefer scoped unit tests that assert mix rejection / encoder flavor. Full `verify:ci` is the post-integrate gate — avoid as Contract `testCommand` (coverage timeout flakes under load).

## Steps

### Step 0: Preflight

- [ ] Inspect current centroid + verify artifact schema for encoder metadata hooks

### Step 1: Bootstrap flag

- [ ] Add `--encoder granite` (and minilm default) namespaced output
- [ ] Document command in script header / STATUS

### Step 2: Verify reject mix

- [ ] Reject mixed-encoder calibration/centroid bundles
- [ ] Tests covering reject path

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand` (typecheck + scoped calibration/verify tests); full `verify:ci` is post-integrate on `main`

## Do NOT

- Flip shipped encoder default
- Reuse MiniLM projection weights as Granite weights
- Soften verify to allow cross-encoder compare

## Completion Criteria

- [ ] Granite centroid path + mix rejection tests green
