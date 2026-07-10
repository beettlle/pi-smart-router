# Task: SP-165 — assert-release-gates.ts and release gate config

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Fail-fast CLI when eval harness aggregate metrics violate versioned thresholds.
**Score:** 4/8

## Source

- Epic: Pre-Release Functional Gates (post-v0.6.0)
- Bucket: infra

## Mission

Add `scripts/eval/assert-release-gates.ts` and `config/release-gates.json` so harness smoke output becomes a release gate. Pure assertion helpers (testable) separate from CLI. Support `--metrics <file>`, `--fixtures <dir>`, and `--config <path>`. Exit 0 on pass, 1 with structured stderr listing failed gates. Derive initial absolute thresholds from current fixture smoke on main (floors at or slightly below observed values).

## Dependencies

- SP-152 (eval harness three-track — landed)
- SP-153 (eval harness CI smoke — landed)

## Context to Read First

- `scripts/eval/harness-tracks.ts` — `HarnessAggregateMetrics` types
- `scripts/eval/run-harness.ts` — `runHarnessOnDir` export
- `scripts/eval/quality-retention.ts` — regression helper patterns
- `tests/eval/fixtures/` — four fixture traces
- `tests/eval/harness-tracks.test.ts` — aggregate smoke expectations

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/assert-release-gates.ts`, `config/release-gates.json` |
| May change | `tests/eval/assert-release-gates.test.ts` |
| Must NOT change | `package.json`, `.github/workflows/release.yml` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/eval/assert-release-gates.ts`, `config/release-gates.json` |
| fileScopeMustNotChange | `package.json`, `.github/workflows/release.yml` |
| completionCriteria | Gate config schema validated; CLI asserts absolute thresholds on harness metrics; unit tests for pass/fail paths; thresholds derived from current fixtures. |

## Steps

### Step 1: Gate config and assertion module

- [ ] Add `config/release-gates.json` with zod-validated schema (`version`, `absolute_gates`)
- [ ] Implement pure `assertAbsoluteGates(metrics, config)` returning pass/fail + failed gate list
- [ ] Threshold keys: `mean_capability_adequacy_rate_min`, `mean_quality_retention_min`, `mean_over_routing_rate_max`, `mean_pin_preserved_rate_min`

### Step 2: CLI entry

- [ ] Implement `assert-release-gates.ts` with `--metrics`, `--fixtures`, `--config`
- [ ] `--fixtures` runs `runHarnessOnDir()` then asserts
- [ ] Structured stderr on failure; exit 0/1

### Step 3: Testing and verification

- [ ] Unit tests: pass with current fixture metrics; fail when threshold violated
- [ ] Run `npm run verify:ci`

## Testing

- [ ] Unit tests for assertion helpers and CLI fixture path
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `config/release-gates.json` with validated schema
- [ ] `assert-release-gates.ts` CLI with metrics and fixtures modes
- [ ] Unit tests for pass and fail paths
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-165): description`

## Do NOT

- Wire into `release:check` or release workflow (SP-166)
- Add baseline regression compare (SP-168)
- Change harness track scoring logic

---
