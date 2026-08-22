# Task: SP-228 — CI quality gates on src and extension

**Created:** 2026-08-22
**Size:** M

## Review Level: 1

**Assessment:** Extend workflow path filters so eval/calibration gates run on routing code changes.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#135
- Bucket: enhancement
- Closes: #135
- Release: v0.17.0
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## Mission

Closes #135 — PR CI must not go green when only `src/**` or `.pi/extensions/smart-router/**` change without eval/calibration workflows. Add those paths to `eval-harness-smoke.yml` and routing-relevant paths to `calibration-verify.yml`. Document full gate set in `npm run verify:ci` / README. Note: branch protection required-check policy may need human operator.

## Dependencies

- None

## Context to Read First

- `.github/workflows/ci.yml`, `eval-harness-smoke.yml`, `calibration-verify.yml`, `release.yml`
- `package.json` scripts — `verify:ci`
- Issue #135 body

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/eval-harness-smoke.yml`, `.github/workflows/calibration-verify.yml` |
| May change | `README.md`, `package.json` (verify:ci docs only) |
| Must NOT change | `config/release-gates.json` thresholds |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `.github/workflows/eval-harness-smoke.yml` |
| fileScopeMustNotChange | `config/release-gates.json` |
| completionCriteria | src/** and .pi/extensions/** trigger eval-harness-smoke; classifier/pipeline paths trigger calibration-verify; verify:ci documents gates; #135 closable |

## Steps

### Step 1: Update workflow path filters

- [ ] Add `src/**` and `.pi/extensions/smart-router/**` to eval-harness-smoke triggers
- [ ] Add routing-relevant src paths to calibration-verify triggers

### Step 2: Document operator gate set

- [ ] Ensure `verify:ci` / README lists full pre-release gate set

### Step 3: Testing and verification

- [ ] Validate workflow YAML syntax
- [ ] Run Contract `testCommand`

## Completion Criteria

- [ ] Routing code edits trigger quality workflows
- [ ] Operator docs updated
- [ ] #135 closable

## Do NOT

- Change absolute release-gates.json thresholds
- Enable #96 encoder defaults
