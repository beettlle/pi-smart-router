# Task: SP-254 — Live leaderboard re-ingest + Gemini fleet aliases

**Created:** 2026-09-02
**Size:** S

## Review Level: 1

**Assessment:** Release hygiene: live public leaderboard ingest + fleet alias retarget; no router hot-path code.
**Score:** 3/8 — Blast radius: 1 (capability artifact), Pattern novelty: 0, Security: 0, Reversibility: 2

## Source

- Bucket: documentation (release hygiene)
- Release: v0.21.0
- Manifest: `spine-tasks/_authoring/release-v0.21.0/manifest.md`
- Operator scope expand (2026-09-02): capability grounding — not a 4th enhancement issue

## Mission

Ship **fresh grounded capability profiles** for v0.21.0 by re-ingesting public model leaderboards and fixing stale Gemini fleet aliases:

1. Run live ingest (`npm run routing:ingest-benchmarks -- --live`) so `config/benchmark-profiles.json` and `tests/fixtures/benchmark-leaderboards/recorded/` pick up boards published since freeze **2026-08-30**. On total live failure, fall back to `--recorded` / fixtures — never invent scores.
2. Retarget dogfood fleet ids away from stale `gemini-2.5-flash` when a better grounded row exists after ingest: `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-3.1-pro-preview` (and `google/`-prefixed forms if used). Aliases may only point at existing `models[].model_id`. If no suitable row exists, remove the bad 2.5 alias and document intentional `pattern_default` (one-line rationale in coverage doc or STATUS).
3. Keep `DEFAULT_FLEET_BENCHMARK_ALIASES` in `scripts/ingest-benchmark-profiles.ts` aligned with the artifact aliases so empty-artifact re-ingest does not re-seed `gemini-flash-latest → gemini-2.5-flash`.
4. Mapper/coverage tests: assert `capability_source === 'benchmark'` or intentional `pattern_default` for those fleet ids.
5. Do **not** edit README theme docs (SP-253), integrity packet scopes, absolute `release-gates.json`, or retrain P(success).

## Dependencies

- **None**

## Context to Read First

- README — Benchmark profile refresh / `routing:ingest-benchmarks -- --live`
- `config/benchmark-profiles.json` — current aliases + provenance dates
- `scripts/ingest-benchmark-profiles.ts` — `DEFAULT_FLEET_BENCHMARK_ALIASES` (Gemini → 2.5 block)
- `docs/capability-profile-coverage.md` (if present)
- `tests/unit/pi-model-mapper.test.ts`, `tests/unit/pi-model-mapper-coverage.test.ts`
- Manifest hygiene note in `spine-tasks/_authoring/release-v0.21.0/manifest.md`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** Network for `--live` ingest (fail open to recorded/fixtures)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/benchmark-profiles.json`, `scripts/ingest-benchmark-profiles.ts` |
| May change | `tests/fixtures/benchmark-leaderboards/recorded/**`, `tests/unit/pi-model-mapper.test.ts`, `tests/unit/pi-model-mapper-coverage.test.ts`, `tests/unit/ingest-benchmark-profiles.test.ts`, `docs/capability-profile-coverage.md` |
| Must NOT change | `src/domain/pipeline/**`, `src/api/middleware/**`, `src/infra/telemetry.ts`, `src/domain/matching/**`, `.pi/extensions/smart-router/**`, `README.md` (SP-253), `config/release-gates.json`, `package.json` (version), `src/config/pi-model-mapper.ts` (unless tiny export forced — prefer artifact/alias only) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm run routing:verify-benchmark-profiles && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-coverage.test.ts` |
| fileScopeMustChange | `config/benchmark-profiles.json`, `scripts/ingest-benchmark-profiles.ts` |
| fileScopeMustNotChange | `README.md`, `config/release-gates.json`, `package.json`, `src/domain/pipeline/**` |
| completionCriteria | Live or recorded ingest committed; Gemini dogfood ids retargeted or intentional pattern_default; DEFAULT_FLEET_BENCHMARK_ALIASES aligned; verify + mapper tests green; STATUS notes live/recorded/fixture per board |

## Steps

### Step 0: Preflight

- [ ] Read README ingest section + current `config/benchmark-profiles.json` aliases
- [ ] Note freeze `catalog_freeze_date` / `scrape_date` (expect 2026-08-30 pre-change)
- [ ] List dogfood ids to retarget: `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-3.1-pro-preview`

### Step 1: Live leaderboard ingest

- [ ] Run `npm run routing:ingest-benchmarks -- --live` (network)
- [ ] On total failure: `--recorded` or fixture ingest — do not invent scores
- [ ] Commit dirty `config/benchmark-profiles.json` + `tests/fixtures/benchmark-leaderboards/recorded/**` when changed
- [ ] Record per-board `source=live|recorded|fixture` in STATUS Discoveries

### Step 2: Fleet alias retarget + seed defaults

- [ ] Retarget aliases only onto existing post-ingest `models[].model_id` rows
- [ ] If no suitable row: remove stale `→ gemini-2.5-flash` for rolling `*-latest` / document intentional `pattern_default`
- [ ] Update `DEFAULT_FLEET_BENCHMARK_ALIASES` to match artifact (no re-seed of stale 2.5 mapping for `gemini-flash-latest`)
- [ ] Optional: one-line coverage rationale in `docs/capability-profile-coverage.md`

### Step 3: Testing & Verification

- [ ] Contract `testCommand` green
- [ ] Mapper coverage asserts for dogfood fleet ids (`benchmark` or intentional `pattern_default`)
- [ ] Provenance dates advanced when live succeeded

## Completion Criteria

- [ ] Public leaderboards re-ingested (live preferred; recorded/fixture fallback documented)
- [ ] Gemini dogfood aliases corrected or intentional pattern_default with rationale
- [ ] Seed defaults aligned; verify + unit tests green

## Do NOT

- Invent leaderboard scores or alias to non-existent `model_id` rows
- Edit README theme docs (SP-253) or integrity packet file scopes
- Change absolute `config/release-gates.json` thresholds
- Retrain P(success) / calibration weights
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `chore(SP-254): live benchmark profile refresh + Gemini fleet aliases`

## Amendments

- None
