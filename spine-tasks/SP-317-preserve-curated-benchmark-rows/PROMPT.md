# Task: SP-317 — live refresh preserves curated Claude/Gemini grounding rows

**Created:** 2026-11-15
**Size:** M

## Review Level: 2

**Assessment:** Bug — `release:refresh-benchmarks` live ingest drops SP-311 curated Claude/Gemini rows that exist only in fixtures, regressing #193 grounding.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1
**Problem theory:** Live leaderboards lack curated ids (e.g. `claude-haiku-4-5`); refresh rewrites `config/benchmark-profiles.json` from live-only models and drops fixture-only curated rows / changes capabilities.

## Source

- GitHub: beettlle/pi-smart-router#199
- Release: v1.4.0
- Bucket: bug
- Closes: #199

## Mission

Closes #199 — Make live (and live+record) ingest **preserve operator-curated model rows** (and their capabilities / provenance) when live sources omit them. Merge curated rows over live data with clear provenance so `npm run release:check` can run without `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1`.

Required:

1. Identify which rows are curated (fixture-only / operator-preserved) vs live-derived — prefer an explicit preserve list or merge-from-existing-artifact strategy consistent with existing alias/ungrounded preserve (SP-174 / SP-311).
2. On live refresh, keep curated rows such as `claude-haiku-4-5` / `claude-3.5-haiku` (and any other SP-311 curated ids) instead of dropping them.
3. Add a regression test: live+record (or mocked live) ingest preserves curated rows present in the prior artifact / fixtures.
4. Document in STATUS how operators should refresh without the skip env workaround.

## Dependencies

- None

## Context to Read First

- `scripts/ingest-benchmark-profiles.ts`, `scripts/release-refresh-benchmark-profiles.ts`
- `tests/fixtures/benchmark-leaderboards/**`
- `config/benchmark-profiles.json`
- `tests/unit/ingest-benchmark-profiles.test.ts`
- Issue beettlle/pi-smart-router#199
- `spine-tasks/SP-311-benchmark-grounding-claude5-gemini/PROMPT.md`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None for unit test (mock/fixture); network optional for manual live dogfood

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/ingest-benchmark-profiles.ts`, `tests/unit/ingest-benchmark-profiles.test.ts` |
| May change | `scripts/release-refresh-benchmark-profiles.ts`, `scripts/lib/**`, `tests/fixtures/benchmark-leaderboards/**`, `config/benchmark-profiles.json` |
| Must NOT change | `package.json`, `src/config/pi-model-mapper.ts`, `src/domain/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-benchmark-profiles.test.ts tests/unit/benchmark-leaderboard-fetch.test.ts && npm run routing:verify-benchmark-profiles && bash scripts/spine-stet-contract-run.sh default SP-317` |
| fileScopeMustChange | `scripts/ingest-benchmark-profiles.ts`, `tests/unit/ingest-benchmark-profiles.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/config/pi-model-mapper.ts`, `src/domain/`, `.review/` |
| completionCriteria | Live/mocked refresh preserves curated Claude/Gemini rows; regression test green; verify-benchmark-profiles green |

## Steps

### Step 0: Preflight

- [ ] Reproduce drop: compare fixture-curated ids vs live-only model set; list rows that must be preserved

### Step 1: Preserve/merge implementation

- [ ] Merge curated rows over live ingest with provenance; keep aliases/ungrounded preserve behavior

### Step 2: Regression test

- [ ] Test that live+record (or mocked live) ingest keeps curated rows

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Note in STATUS that unskipped `release:check` is the intended gate after this lands

## Do NOT

- Invent new benchmark scores
- Disable live refresh permanently via skip env as the fix

## Completion Criteria

- [ ] #199 closed — curated rows survive live refresh
- [ ] Contract green
