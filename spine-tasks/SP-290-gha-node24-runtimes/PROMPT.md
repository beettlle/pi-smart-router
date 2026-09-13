# Task: SP-290 — bump GitHub Actions to Node-24 runtimes

**Created:** 2026-09-12
**Size:** S

## Review Level: 1

**Assessment:** CI hygiene — bump action majors off deprecated Node 20 runtimes.
**Score:** 2/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#174
- Release: v1.2.0
- Bucket: ops (non-quota)
- Closes: #174

## Mission

Bump workflow action pins to Node-24-native majors for the inventory in #174 (`actions/checkout`, `actions/setup-node`, `actions/github-script`, `actions/upload-artifact`). Do **not** change `package.json` `engines.node` or workflow `node-version: 22.19.0`.

## Dependencies

- SP-289

## Context to Read First

- `.github/workflows/*.yml`
- Issue beettlle/pi-smart-router#174
- GitHub changelog: Deprecation of Node 20 on Actions runners

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None (verify latest action majors at implement time)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/` |
| Must NOT change | `package.json`, `src/**`, `config/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `.github/workflows/` |
| fileScopeMustNotChange | `package.json`, `src/` |
| completionCriteria | All inventoried actions on Node-24-native majors; no engines/node-version app change; STATUS notes versions chosen |

> **Contract note (wave-1 retry):** Prefer `typecheck` over `release:check` in-lane — live
> benchmark refresh dirties the worktree and fails contract verify. Full
> `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1 npm run release:check` remains the
> post-integrate regression gate on `main`.

## Steps

### Step 0: Preflight

- [ ] Inventory current pins across all workflows under `.github/workflows/`
- [ ] Confirm latest stable majors for checkout / setup-node / github-script / upload-artifact

### Step 1: Implementation

- [ ] Bump pins in every workflow that uses the inventoried actions
- [ ] Keep workflow `node-version` / `engines.node` unchanged

### Step 2: Testing & Verification

- [ ] Run Contract `testCommand` (`npm run typecheck`)
- [ ] Record chosen action versions in STATUS
- [ ] Note: post-integrate `release:check` (with skip-live if needed) is operator-owned on `main`

## Do NOT

- Change app Node engines or CI `node-version: 22.19.0`
- Attach product/calibration logic to this packet

## Completion Criteria

- [ ] #174 acceptance criteria met for workflow pins
- [ ] `npm run release:check` exit 0
