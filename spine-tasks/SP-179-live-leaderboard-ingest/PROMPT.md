# Task: SP-179 — Live Leaderboard Snapshot Ingest

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Extend fixture-only ingest with CI-safe live fetch + recorded snapshot path for Terminal-Bench / SWE-bench / LiveCodeBench / BFCL.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#100
- Bucket: feature
- Partial: #100 (ingest path; CI/docs in SP-180)
- Release: v0.9.0

## Mission

#75 / SP-134 shipped fixture-based leaderboard ingest. #100 needs an operator-refreshable pipeline that can **pull or record** public leaderboard snapshots while remaining CI-safe (default fixtures; optional live fetch; checked-in recorded snapshot for regression). Extend `scripts/ingest-benchmark-profiles.ts` so operators can:

1. Ingest from fixtures (existing default — must keep working).
2. Optionally fetch live leaderboard snapshots (or a documented fetch adapter) and write a **recorded** snapshot under `tests/fixtures/benchmark-leaderboards/` (or a sibling recorded dir).
3. Re-ingest from a recorded live snapshot without network (CI/unit path).

Preserve provenance (`source_urls`, `scrape_date`, `catalog_freeze_date`) and fleet aliases (SP-174). Do not invent capability scores. Network failures must fail clearly and leave fixtures as the default path.

## Dependencies

- **None** (builds on landed SP-134/SP-174)

## Context to Read First

- `scripts/ingest-benchmark-profiles.ts` — CLI, fixture schema, aggregate, aliases
- `tests/unit/ingest-benchmark-profiles.test.ts`
- `tests/fixtures/benchmark-leaderboards/**`
- `config/benchmark-profiles.json` — artifact shape
- GitHub #100 acceptance criteria (live + recorded snapshot)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/ingest-benchmark-profiles.ts` |
| May change | `scripts/lib/**`, `tests/unit/ingest-benchmark-profiles.test.ts`, `tests/fixtures/benchmark-leaderboards/**`, `package.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**`, `.github/workflows/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-benchmark-profiles.test.ts` |
| fileScopeMustChange | `scripts/ingest-benchmark-profiles.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `.github/workflows/**` |
| completionCriteria | CLI supports fixtures default + live/record + recorded replay; unit tests cover fixture + one recorded live snapshot without network; provenance preserved; `routing:verify-benchmark-profiles` still green on fixtures. |

## Steps

### Step 1: Live / recorded ingest modes

- [ ] Add CLI flags for live fetch and/or record-to-fixture and ingest-from-recorded (names explicit in `--help`)
- [ ] Keep default path = checked-in fixtures (no network)
- [ ] On live success, write recorded snapshot(s) with scrape_date + source_url matching existing fixture schema
- [ ] Fail fast with clear errors on network/parse failure; do not corrupt `config/benchmark-profiles.json` on failed live runs

### Step 2: Recorded snapshot fixture + unit tests

- [ ] Check in at least one **recorded** live-style snapshot (or mark a fixture as recorded provenance) usable offline
- [ ] Unit tests: fixtures default; recorded replay without network; help/usage documents new flags
- [ ] `npm run routing:verify-benchmark-profiles` still passes for the committed artifact path

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/ingest-benchmark-profiles.test.ts`
- [ ] Run `npm run routing:verify-benchmark-profiles`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Default ingest remains fixture-only (CI-safe)
- [ ] Live and/or record path exists and is documented in CLI help
- [ ] Offline unit coverage for recorded snapshot replay
- [ ] Provenance fields present on recorded artifacts
- [ ] Fleet aliases preserved on re-ingest

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Check If Affected | `README.md` (full operator docs land in SP-180) |

## Git Commit Convention

- `feat(SP-179): description`

## Do NOT

- Change monthly CI workflow (SP-180)
- Flip production mapper defaults or invent scores
- Download full corpora in PR CI
- Modify `router-pipeline.ts` or the pi extension
- Bump npm version

---

## Amendments (Added During Execution)

(none yet)
