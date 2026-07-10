# Task: SP-182 — SWE-bench Verified Native Live Adapter

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Native adapter from SWE-bench.github.io leaderboards.json Verified board → fixture entries.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#104
- Bucket: feature
- Partial: #104

## Mission

Partial #104 — Replace the `swebench_verified` stub adapter with a native parser for:

`https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json`

Select the board named **Verified**. Map each result’s display `name` / tags to catalog `model_id`s used in fixtures/aliases (e.g. claude-opus-4-5, gpt-5.3-codex). Use `resolved` as `score` (0–100 scale consistent with fixtures). Drop or skip rows that cannot be mapped — do not invent scores. Set `source_url` to the JSON raw URL (or documented provenance URL) and stamp `scrape_date`.

## Dependencies

- **Task:** SP-181 (adapter registry + fallback orchestration)

## Context to Read First

- `scripts/lib/leaderboard-adapters/` — interface from SP-181
- `tests/fixtures/benchmark-leaderboards/swebench_verified.json` — target entry shape / model_ids
- `spine-tasks/_authoring/live-leaderboard-adapters-20260710.md`
- Sample payload shape: `leaderboards[]` → `{ name: "Verified", results: [{ name, resolved, tags, ... }] }`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/lib/leaderboard-adapters/swebench-verified.ts` |
| May change | `tests/unit/leaderboard-adapters/swebench-verified.test.ts`, `scripts/lib/leaderboard-adapters/index.ts` (registration only if stub path differs), `tests/fixtures/benchmark-leaderboards/recorded/swebench_verified.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/leaderboard-adapters/livecodebench.ts`, `scripts/lib/leaderboard-adapters/bfcl.ts`, `scripts/lib/leaderboard-adapters/terminal-bench.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/leaderboard-adapters/swebench-verified.test.ts` |
| fileScopeMustChange | `scripts/lib/leaderboard-adapters/swebench-verified.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/leaderboard-adapters/livecodebench.ts`, `scripts/lib/leaderboard-adapters/bfcl.ts`, `scripts/lib/leaderboard-adapters/terminal-bench.ts` |
| completionCriteria | Adapter converts Verified board JSON to fixture schema; unit tests use checked-in sample snippet (no network required in CI); mapped model_ids align with catalog; unmapped rows skipped. |

## Steps

### Step 1: Parse Verified board → fixture entries

- [ ] Implement adapter: fetch/parse `leaderboards.json`, select `Verified`
- [ ] Map `resolved` → `score`; map model names/tags → catalog `model_id`
- [ ] Register as live default URL for `swebench_verified`

### Step 2: Offline unit fixtures + tests

- [ ] Check in a **small** truncated sample of leaderboards.json under tests (or embed minimal fixture) — CI must not require network
- [ ] Unit tests: Verified extraction, score mapping, unmapped skip, schema validation

### Step 3: Testing and verification

- [ ] Run contract `testCommand`
- [ ] Optional smoke: `npm run routing:ingest-benchmarks -- --live` (may still fallback other benches until SP-183+)
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Native SWE-bench Verified adapter live
- [ ] Offline unit coverage
- [ ] No invented scores

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Check If Affected | `README.md` |

## Git Commit Convention

- `feat(SP-182): description`

## Do NOT

- Change fallback orchestration (SP-181)
- Touch other benchmark adapter files
- Invent scores or scrape HTML
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

---

## Amendments (Added During Execution)

### 2026-07-10 — SP-181 empty live-URL assertions

Registering `swebench_verified.liveFetchUrl` breaks two SP-181 expectations that asserted all stubs omit defaults. Allow updating those assertions only:

| Scope | Paths |
|-------|-------|
| May change (added) | `tests/unit/benchmark-leaderboard-fetch.test.ts`, `tests/unit/ingest-benchmark-profiles.test.ts` |

Constraint: change only expectations around `getDefaultLiveFetchUrls()` / `swebench_verified` `liveFetchUrl`; do not alter fallback orchestration behavior.

### 2026-07-10 — README live-adapter note

`README.md` still says live adapters require fixture-shaped JSON only. SWE-bench Verified now parses native `leaderboards.json`. Allow a minimal docs tweak:

| Scope | Paths |
|-------|-------|
| May change (added) | `README.md` |

Constraint: update only the live-ingest / adapter provenance wording; no unrelated README edits.
