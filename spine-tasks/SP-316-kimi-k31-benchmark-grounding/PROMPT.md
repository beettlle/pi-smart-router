# Task: SP-316 — benchmark-grounded capability row for Kimi K3.1 Pro

**Created:** 2026-11-15
**Size:** M

## Review Level: 2

**Assessment:** Ground K3.1 Pro capability scores in benchmarks (or document ungrounded) so HyDRA does not rely only on FRONTIER_DEFAULTS from SP-314.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#197
- Release: v1.4.0
- Bucket: feature
- Closes: #197

## Mission

Closes #197 — Ground Kimi K3.1 Pro in `config/benchmark-profiles.json`:

1. Extend ingest source data (`scripts/ingest-benchmark-profiles.ts` / fixtures / leaderboard adapters as needed) with a `k3.1-pro` row when public scores exist (Terminal-Bench 4.0 65.7%, MCP Atlas, BrowseComp, HLE from the [K3.1 announcement](https://www.kimi.ai/blog/kimi-k3-1-pro)). Prefer third-party leaderboard values over vendor claims. **Never invent scores.**
2. Add aliases so `kimi-coding/k3.1-pro`, `k3.1-pro-highspeed`, `kimi-k3.1-pro` (and provider-prefixed forms) resolve to the canonical row. Highspeed is the same model served faster.
3. Optional: add a `k3` row or alias if scores exist; otherwise list under `provenance.ungrounded_fleet_ids`.
4. If no third-party scores are available after live/fixture ingest, keep `pattern_default` and document ungrounded ids in provenance — still ship aliases when a curated row is added from fixtures with provenance.

Depends on SP-314 (frontier fallback) and SP-317 (live refresh must preserve curated rows before we add more).

## Dependencies

- SP-314
- SP-317

## Context to Read First

- `scripts/ingest-benchmark-profiles.ts`, `scripts/lib/benchmark-leaderboard-fetch.ts`
- `config/benchmark-profiles.json`
- `tests/unit/ingest-benchmark-profiles.test.ts`
- Issue beettlle/pi-smart-router#197

## Environment

- **Workspace:** pi-smart-router
- **Services required:** Network optional (fixture fallback OK)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/benchmark-profiles.json`, `tests/unit/ingest-benchmark-profiles.test.ts` |
| May change | `scripts/ingest-benchmark-profiles.ts`, `scripts/lib/**`, `tests/fixtures/benchmark-leaderboards/**`, `tests/unit/benchmark-leaderboard-fetch.test.ts`, `tests/unit/pi-model-mapper.test.ts` |
| Must NOT change | `package.json`, `src/config/pi-model-mapper.ts` (pattern rules), `src/domain/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-benchmark-profiles.test.ts tests/unit/benchmark-leaderboard-fetch.test.ts tests/unit/pi-model-mapper.test.ts && npm run routing:verify-benchmark-profiles && bash scripts/spine-stet-contract-run.sh default SP-316` |
| fileScopeMustChange | `config/benchmark-profiles.json`, `tests/unit/ingest-benchmark-profiles.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/config/pi-model-mapper.ts`, `src/domain/`, `.review/` |
| completionCriteria | k3.1-pro aliases present; grounded via benchmark or listed ungrounded with provenance; verify-benchmark-profiles green; no invented scores |

## Steps

### Step 0: Preflight

- [ ] Check live/fixture leaderboards for K3.1 Pro scores; record availability in STATUS

### Step 1: Ingest / curated row

- [ ] Add row and/or fixture data; adapter name normalization if needed

### Step 2: Aliases and provenance

- [ ] Alias map for scoped Kimi ids; ungrounded list if scores missing

### Step 3: Testing & Verification

- [ ] Alias resolution tests; `npm run routing:verify-benchmark-profiles`
- [ ] Run Contract `testCommand`

## Do NOT

- Invent or hand-tune benchmark scores
- Change the SP-314 pattern rule

## Completion Criteria

- [ ] #197 acceptance met (grounded or explicitly ungrounded with aliases)
- [ ] Contract green
