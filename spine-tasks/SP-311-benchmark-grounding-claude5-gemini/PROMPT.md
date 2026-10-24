# Task: SP-311 — Benchmark grounding + aliases for Claude 5.x and Gemini 3.1/4

**Created:** 2026-10-24
**Size:** M

## Review Level: 2

**Assessment:** `config/benchmark-profiles.json` (scrape 2026-09-13) grounds only `claude-opus-4-5`, `claude-sonnet-4-6`, `gemini-2.5-flash`; the operator's current Claude/Gemini fleet runs on identical pattern defaults, so HyDRA separates frontier models only by price.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#193
- Release: v1.3.0 (operator-approved fourth enhancement, 2026-10-24)
- Bucket: feature
- Partial: #193 (benchmark grounding; fairness in SP-312)

## Mission

- Refresh leaderboard snapshots with the existing ingest (`scripts/ingest-benchmark-profiles.ts`, live + record mode; see header modes) so rows exist for any of these that appear on SWE-bench Verified, Terminal-Bench, LiveCodeBench, or BFCL: `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `gemini-4-argon`, `gemini-3.1-pro-preview`, `gemini-flash-latest`.
  - If the live adapters fail or a lane has no network, record that in STATUS and use leaderboard values the operator supplies via the checked-in fixture files (`tests/fixtures/benchmark-leaderboards/*.json`) — never invent scores.
  - If an adapter does not recognize a new leaderboard model name, extend its name normalization in `scripts/lib/benchmark-leaderboard-fetch.ts` with a test.
- Add fleet aliases in the artifact's `aliases` map (preserved across re-ingest, SP-174) for the pi ids the operator scopes: `anthropic/claude-*-5-*`, `google/gemini-4-argon`, `gemini-3.1-pro-preview-customtools` → `gemini-3.1-pro-preview`, and the `*-latest` Gemini Flash ids → their canonical row when the leaderboard uses a dated name.
- Ids with no public score stay `pattern_default`. List them in `provenance` (e.g. `ungrounded_fleet_ids`) so operators see the gap.
- Update `provenance.scrape_date` / `catalog_freeze_date`.

## Dependencies

- SP-310 (family rules decide the fallback tier for ungrounded ids)

## Context to Read First

- `scripts/ingest-benchmark-profiles.ts`, `scripts/lib/benchmark-leaderboard-fetch.ts`, `scripts/release-refresh-benchmark-profiles.ts`
- `config/benchmark-profiles.json` (`aliases`, `provenance`)
- `src/config/pi-model-mapper.ts` (`lookupBenchmarkCapabilities`, alias resolution)
- `tests/unit/ingest-benchmark-profiles.test.ts`, `tests/unit/benchmark-leaderboard-fetch.test.ts`
- Issue beettlle/pi-smart-router#193

## Environment

- **Workspace:** pi-smart-router
- **Services required:** Network for live leaderboard fetch (optional — fixture fallback)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/benchmark-profiles.json`, `tests/fixtures/benchmark-leaderboards`, `tests/unit/ingest-benchmark-profiles.test.ts` |
| May change | `scripts/ingest-benchmark-profiles.ts`, `scripts/lib/benchmark-leaderboard-fetch.ts`, `tests/unit/benchmark-leaderboard-fetch.test.ts`, `tests/unit/pi-model-mapper.test.ts` |
| Must NOT change | `package.json`, `src/domain/**`, `src/config/pi-model-mapper.ts` (rules), `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-benchmark-profiles.test.ts tests/unit/benchmark-leaderboard-fetch.test.ts tests/unit/pi-model-mapper.test.ts && npm run routing:verify-benchmark-profiles && bash scripts/spine-stet-contract-run.sh default SP-311` |
| fileScopeMustChange | `config/benchmark-profiles.json`, `tests/unit/ingest-benchmark-profiles.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/domain/`, `.review/` |
| completionCriteria | Artifact refreshed with provenance; aliases cover the scoped pi ids; every scoped Claude/Gemini id is either `benchmark` or listed as ungrounded; checked-in artifact matches fixture ingest; tests green |

## Steps

### Step 0: Preflight

- [ ] List which scoped ids each leaderboard currently publishes (live fetch or operator-supplied snapshot)

### Step 1: Ingest refresh

- [ ] Live + record (or fixture fallback); adapter name normalization for new model names

### Step 2: Aliases and provenance

- [ ] Alias map for scoped pi ids; `ungrounded_fleet_ids`; dates

### Step 3: Testing & Verification

- [ ] `getCapabilitySource` returns `benchmark` for each grounded scoped id (direct or alias)
- [ ] Ungrounded ids keep pattern defaults from SP-310
- [ ] `npm run routing:verify-benchmark-profiles` green
- [ ] Run Contract `testCommand`

## Do NOT

- Invent or hand-tune benchmark scores
- Change how grounded scores are scaled (SP-312)

## Completion Criteria

- [ ] #193 grounding items met
- [ ] Contract tests green
