# Task: SP-180 — Live Refresh CI + Operator Docs

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Wire monthly CI and README to SP-179 live/recorded ingest; mapper smoke that fleet floors reflect ingested scores.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#100
- Bucket: feature
- Closes: #100
- Release: v0.9.0

## Mission

With SP-179 live/recorded ingest available, extend `.github/workflows/benchmark-profile-refresh.yml` so scheduled/manual refresh can optionally use live fetch (falling back to fixtures when live is unavailable), rewrite `config/benchmark-profiles.json` with provenance, and open a PR when scores change — including updating recorded snapshots when live succeeds. Document the operator refresh command and cadence in README (extend the existing Benchmark profile refresh section). Add a mapper smoke assertion that frontier / tool_use floors for at least one scoped fleet ID reflect the ingested artifact (not pattern-default-only).

## Dependencies

- **Task:** SP-179 (live/recorded ingest CLI must exist)

## Context to Read First

- `spine-tasks/SP-179-live-leaderboard-ingest/PROMPT.md` — flags and recorded layout
- `.github/workflows/benchmark-profile-refresh.yml` — current fixture-only refresh
- `README.md` — Benchmark profile refresh section
- `src/config/pi-model-mapper.ts` — `capability_source`, aliases
- `tests/unit/pi-model-mapper.test.ts`
- GitHub #100 verification checklist

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/benchmark-profile-refresh.yml`, `README.md` |
| May change | `tests/unit/pi-model-mapper.test.ts`, `tests/unit/ingest-benchmark-profiles.test.ts`, `package.json`, `config/benchmark-profiles.json`, `tests/fixtures/benchmark-leaderboards/**` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/ingest-benchmark-profiles.test.ts` |
| fileScopeMustChange | `.github/workflows/benchmark-profile-refresh.yml`, `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Workflow documents/uses live-or-fixture refresh with provenance; README has operator refresh command + cadence; mapper smoke shows fleet floors from ingested scores; PR smoke still fixture-only; `npm run verify:ci` green. |

## Steps

### Step 1: Monthly / dispatch live-capable refresh

- [ ] Extend `benchmark-profile-refresh.yml` scheduled + `workflow_dispatch` path to attempt live ingest (or documented input flag) with fixture fallback
- [ ] When live succeeds, commit/update recorded snapshots + regenerated `config/benchmark-profiles.json` in the bot PR
- [ ] Keep PR-path smoke on fixtures only (no network in PR CI)
- [ ] Preserve provenance block in PR body / artifact header

### Step 2: Operator docs + mapper smoke

- [ ] Document operator refresh command, live vs fixture modes, and monthly cadence in README Benchmark profile refresh section
- [ ] Mapper smoke: at least one scoped fleet ID’s frontier/tool_use (or capability floors) reflect ingested benchmark scores (`capability_source === 'benchmark'`)
- [ ] Link cadence to workflow schedule (1st of month / dispatch)

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/ingest-benchmark-profiles.test.ts`
- [ ] Run `npm run routing:verify-benchmark-profiles`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage
- [ ] Validate workflow YAML still parses (actionlint optional; at least `npm run verify:ci`)

## Completion Criteria

- [ ] Monthly/dispatch refresh can use live path with fixture fallback
- [ ] PR smoke remains fixture-only / offline
- [ ] README documents refresh command + cadence
- [ ] Mapper smoke proves fleet floors from ingested scores
- [ ] #100 acceptance criteria met; issue closable

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Must Update | `README.md` (Benchmark profile refresh — live/recorded + cadence) |

## Git Commit Convention

- `feat(SP-180): description`

## Do NOT

- Require live network in PR CI smoke
- Reimplement ingest CLI (SP-179)
- Change router-pipeline or extension wiring
- Enable modernbert_k4 default (#96)
- Bump npm version (release operator owns publish)

---

## Amendments (Added During Execution)

(none yet)
