# Task: SP-203 — Track B Dogfood Export → Harness Adapter

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Schema + adapter for privacy-safe dogfood export → harness records; replace permanent Track B skip stub.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#111
- Bucket: feature
- Closes: #111
- Partial: #95 (live traces in harness AC)
- Release: v0.11.0

## Mission

Closes #111 — Define a schema mapping privacy-safe dogfood export rows → TwinRouterBench-style static harness records (documented + zod or equivalent). Implement adapter used by `resolveTrackB` in `scripts/eval/community-bench.ts`. When export is valid and labeled, Track B runs and reports gates; when incomplete, skip with a clear reason — **never invent outcome labels**. Update unit tests (replace permanent skip-stub expectations), README community-bench Track B section, and add a synthetic/redacted example fixture under `tests/eval/` for CI.

## Dependencies

- **None**

## Context to Read First

- `scripts/eval/community-bench.ts` — `resolveTrackB`, `TRACK_B_SKIP_REASON_ADAPTER_INCOMPLETE`
- `tests/unit/community-bench-track-bc.test.ts`
- `specs/001-build-smart-router/contracts/telemetry-contrib.schema.json`
- `scripts/eval/twinrouterbench-adapter.ts` / fixture schema patterns
- GitHub #111; parent #95

## Environment

- **Workspace:** `scripts/eval/`, `tests/unit/`, `tests/eval/`, `README.md`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/community-bench.ts`, `scripts/eval/dogfood-track-b-adapter.ts`, `tests/unit/community-bench-track-bc.test.ts` |
| May change | `tests/eval/fixtures/dogfood-track-b/**`, `README.md`, `package.json`, `docs/qa/shadow-dogfood-protocol.md` |
| Must NOT change | `config/release-gates.json`, `src/config/defaults.ts`, `src/domain/pipeline/router-pipeline.ts`, `scripts/eval/analyze-twinrouterbench-overrouting.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/community-bench-track-bc.test.ts` |
| fileScopeMustChange | `scripts/eval/community-bench.ts`, `scripts/eval/dogfood-track-b-adapter.ts`, `tests/unit/community-bench-track-bc.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/config/defaults.ts` |
| completionCriteria | Adapter maps valid labeled export → Track B ran; incomplete export skips with reason; no invented labels; README + example fixture; #111 closable. |

## Steps

### Step 1: Schema + adapter module

- [ ] Add `scripts/eval/dogfood-track-b-adapter.ts` with zod (or equivalent) schema + mapper to harness/static records
- [ ] Document required outcome fields; refuse / skip when labels missing (no invention)
- [ ] Example fixture under `tests/eval/fixtures/dogfood-track-b/` (synthetic or redacted)

### Step 2: Wire resolveTrackB + tests + docs

- [ ] `resolveTrackB` uses adapter: valid+labeled → ran + gate metrics; else skip with explicit reason
- [ ] Update `tests/unit/community-bench-track-bc.test.ts` — replace permanent always-skip stub expectations
- [ ] README community-bench Track B: from “always skips” to “runs when adapter + export present”
- [ ] Optional: note in `docs/qa/shadow-dogfood-protocol.md`

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Smoke: `npm run routing:community-bench -- --dogfood-export <fixture>` shows Track B ran or clear skip
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage
- [ ] Comment + close #111; note Partial #95 remaining human AC

## Documentation Requirements

**Must Update:**
- `README.md` — community-bench Track B section *(also in File Scope May change)*

**Check If Affected:**
- `docs/qa/shadow-dogfood-protocol.md`
- `specs/001-build-smart-router/contracts/telemetry-contrib.schema.json` (read; only change if schema extension required)

## Completion Criteria

- [ ] Schema + adapter implemented
- [ ] Track B runs on valid labeled export; skips incomplete without inventing labels
- [ ] Unit tests + example fixture
- [ ] README updated
- [ ] #111 closable

## Git Commit Convention

- `feat(SP-203): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Invent min_tier / success labels when missing
- Change absolute `config/release-gates.json` thresholds
- Close #95 fully (human dogfood sessions remain)
- Flip encoder defaults (#96)

## Amendments

None.
