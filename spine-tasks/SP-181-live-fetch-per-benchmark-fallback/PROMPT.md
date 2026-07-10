# Task: SP-181 — Live Fetch Per-Benchmark Fallback + Adapter Registry

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Replace fail-fast all-or-nothing live fetch with per-benchmark fallback and a pluggable adapter registry (stubs for four benchmarks).
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#104
- Bucket: feature
- Partial: #104 (foundation; adapters in SP-182–SP-185)
- Follow-on: #100 / SP-179

## Mission

Partial #104 — SP-179 `--live` points `BENCHMARK_SOURCE_URLS` at HTML pages and `fetchAllLiveLeaderboards` fails the entire run on the first error. Introduce:

1. A **LeaderboardAdapter** interface under `scripts/lib/leaderboard-adapters/` that converts native live payloads → fixture-shaped snapshots.
2. A registry (`index.ts`) wiring all four benchmarks to **stub** adapters that still accept fixture-shaped JSON (preserve `--live-url` override path).
3. **Per-benchmark** live orchestration: for each benchmark, try adapter live fetch → on failure fall back to recorded snapshot → then checked-in fixture; never invent scores; never abort siblings because one source failed.
4. Separate **human provenance URLs** (HTML pages for docs) from **live fetch URLs** (JSON/CSV endpoints) in constants.

SP-182–SP-185 replace stubs with native adapters without reworking orchestration.

## Dependencies

- **None** (builds on landed SP-179)

## Context to Read First

- `scripts/lib/benchmark-leaderboard-fetch.ts` — current fail-fast live fetch
- `scripts/ingest-benchmark-profiles.ts` — `BENCHMARK_SOURCE_URLS`, fixture schema, CLI `--live`
- `scripts/release-refresh-benchmark-profiles.ts` — release gate expectations
- `spine-tasks/_authoring/live-leaderboard-adapters-20260710.md`
- GitHub #104

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/lib/benchmark-leaderboard-fetch.ts`, `scripts/lib/leaderboard-adapters/types.ts`, `scripts/lib/leaderboard-adapters/index.ts` |
| May change | `scripts/lib/leaderboard-adapters/*-stub.ts` or stub modules for four benchmarks, `scripts/ingest-benchmark-profiles.ts`, `tests/unit/ingest-benchmark-profiles.test.ts`, `tests/unit/benchmark-leaderboard-fetch.test.ts`, `package.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-benchmark-profiles.test.ts tests/unit/benchmark-leaderboard-fetch.test.ts` |
| fileScopeMustChange | `scripts/lib/benchmark-leaderboard-fetch.ts`, `scripts/lib/leaderboard-adapters/types.ts`, `scripts/lib/leaderboard-adapters/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Per-benchmark live path falls back independently; one failing source does not block others; stubs still parse fixture-shaped JSON; unit tests cover mixed success/fallback; no invented scores. |

## Steps

### Step 1: Adapter types + registry stubs

- [ ] Add `LeaderboardAdapter` (fetch/parse/normalize → fixture schema) under `scripts/lib/leaderboard-adapters/`
- [ ] Registry maps each `BenchmarkId` to a stub that accepts fixture-shaped JSON (current behavior) so `--live-url` to a JSON mirror still works
- [ ] Split human provenance URLs vs live fetch URL defaults (stubs may keep live URL unset / override-only until SP-182+)

### Step 2: Per-benchmark fallback orchestration

- [ ] Change `fetchAllLiveLeaderboards` (or successor) to try each benchmark independently
- [ ] Fallback order per benchmark: live adapter → recorded dir → checked-in fixtures
- [ ] Aggregate result includes which source was used per benchmark (log or return metadata); never invent scores
- [ ] Wire CLI `--live` / release refresh through the new path

### Step 3: Testing and verification

- [ ] Unit tests: one live success + one live fail → recorded/fixture for the failed id; siblings still present
- [ ] Existing fixture default + recorded replay tests still pass
- [ ] Run `npm run typecheck && npx vitest run tests/unit/ingest-benchmark-profiles.test.ts tests/unit/benchmark-leaderboard-fetch.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Fail-fast-all-four behavior removed
- [ ] Adapter registry + stubs exist for SP-182–SP-185 to replace
- [ ] Provenance still recorded; scores never invented
- [ ] Scoped + full tests green

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Check If Affected | `README.md` (operator live docs — full update may wait for SP-185) |

## Git Commit Convention

- `feat(SP-181): description`

## Do NOT

- Implement native SWE/LCB/BFCL/TB parsers (SP-182–SP-185)
- Invent or hardcode capability scores
- Modify `router-pipeline.ts`, `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump npm version

---

## Amendments (Added During Execution)

(none yet)
