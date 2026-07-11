# NEW ISSUE — Track B dogfood export → harness adapter

**Suggested title:** Community Track B: dogfood export → eval harness adapter (no invented labels)

**Suggested labels:** enhancement, eval, routing

**Action:** Create a new GitHub issue. Blocks full close of #95 “live traces in harness” AC.

---

## Problem

`npm run routing:community-bench -- --dogfood-export PATH` always skips with an explicit reason until #95 adapter lands. Dataset / telemetry-contrib exports exist for calibration but are not wired into eval fixtures. Track B must never invent outcome labels.

## Acceptance criteria

- [ ] Define a schema mapping privacy-safe dogfood export rows → harness / TwinRouterBench-style static records (documented + zod or equivalent).
- [ ] Implement adapter used by `resolveTrackB` in `scripts/eval/community-bench.ts`.
- [ ] When export is valid and labeled, Track B runs and reports gates; when incomplete, skip with clear reason (no invented labels).
- [ ] Unit tests update/replace the permanent skip stub expectations.
- [ ] README community-bench Track B section updated from “always skips” to “runs when adapter + export present”.
- [ ] Example fixture export (synthetic or redacted) under `tests/eval/` for CI — still no invented live outcomes.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Provide real exports for validation | Human QA |
| Schema + adapter + tests | Autonomous |

## Commands / files

- `scripts/eval/community-bench.ts`
- `tests/unit/community-bench-track-bc.test.ts`
- `specs/001-build-smart-router/contracts/telemetry-contrib.schema.json`
- Dataset export path from `/smart-router export dataset`

## Out of scope

- Changing absolute `config/release-gates.json` thresholds
- Closing #95 human dogfood protocol itself
- Inventing min_tier / success labels when missing

## Links

- Parent: #95
- QA protocol: `docs/qa/shadow-dogfood-protocol.md`
