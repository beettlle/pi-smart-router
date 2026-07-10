# Task: SP-166 — Expand release:check with Tier 0 functional smoke

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** Wire calibration verify, benchmark profiles, eval harness smoke, and assert-release-gates into release:check and release workflow.
**Score:** 3/8

## Source

- Epic: Pre-Release Functional Gates (post-v0.6.0)
- Bucket: infra

## Mission

Extend `release:check` so one command runs ship-ready functional smoke before tag. Add `release:functional-smoke` chaining `routing:verify-calibration --skip-embed`, `routing:verify-benchmark-profiles`, and `assert-release-gates --fixtures` (avoid shell pipe fragility). Update `.github/workflows/release.yml` to run functional smoke on tag publish. Document gate chain in README operator release section.

## Dependencies

- SP-165

## Context to Read First

- `package.json` — `release:check`, routing scripts
- `.github/workflows/release.yml` — tag publish job
- `scripts/eval/assert-release-gates.ts` — SP-165 CLI
- `README.md` — release section (~L797)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json`, `.github/workflows/release.yml` |
| May change | `README.md` |
| Must NOT change | `scripts/eval/assert-release-gates.ts`, `config/release-gates.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run release:check` |
| fileScopeMustChange | `package.json`, `.github/workflows/release.yml` |
| fileScopeMustNotChange | `scripts/eval/assert-release-gates.ts`, `config/release-gates.json` |
| completionCriteria | release:functional-smoke and expanded release:check; release workflow runs functional smoke; README documents gate chain; release:check exits 0 on main. |

## Steps

### Step 1: package.json scripts

- [ ] Add `release:functional-smoke` chaining calibration verify, benchmark profiles, assert-release-gates --fixtures
- [ ] Extend `release:check` to include `release:functional-smoke` after consumer-pack

### Step 2: Release workflow and docs

- [ ] Update `release.yml` to run `release:check` or `release:functional-smoke` on tag path
- [ ] Document Tier 0 gate chain in README release section

### Step 3: Testing and verification

- [ ] Run `npm run release:check` locally on main
- [ ] Confirm failure when gate thresholds intentionally violated (via SP-165 unit test)

## Testing

- [ ] Run `npm run release:check` end-to-end
- [ ] Verify release workflow YAML references functional smoke

## Completion Criteria

- [ ] `release:functional-smoke` script added
- [ ] `release:check` includes Tier 0 functional smoke
- [ ] `release.yml` updated
- [ ] README documents gate chain
- [ ] `npm run release:check` passes on main

## Git Commit Convention

- `feat(SP-166): description`

## Do NOT

- Change assert-release-gates logic (SP-165 scope)
- Add baseline regression (SP-168)
- Add benchmark:encoder to release path (Tier 2 deferred)

---
