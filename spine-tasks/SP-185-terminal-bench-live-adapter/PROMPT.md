# Task: SP-185 — Terminal-Bench Live Source + Adapter

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Lock a free public Terminal-Bench live source and implement the native adapter; close #104; update operator docs.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 2, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#104
- Bucket: feature
- Closes: #104

## Mission

Closes #104 — Terminal-Bench has no stable free JSON at `tbench.ai` HTML; Parse marketplace API requires a key (not acceptable as default). This task must:

1. **Lock a live source** that is free, automatable, and documented (candidates: public GitHub/HF aggregated leaderboard JSON if found; otherwise a **documented operator `--live-url`** JSON mirror schema plus best-effort public fetch). Do **not** make paid Parse API the default.
2. Implement `terminal_bench` adapter → fixture schema with model_id mapping.
3. Update README live-source table for all four benchmarks (SWE/LCB/BFCL/TB) and release refresh behavior.
4. End-to-end: `npm run routing:ingest-benchmarks -- --live` succeeds with at least the three solid adapters live and TB either live or cleanly falling back to recorded with clear logs — **never invent scores**.

If no free aggregate exists after honest investigation, ship: (a) fixture-shaped JSON schema docs for operator mirrors, (b) adapter that consumes that schema from `--live-url`, (c) recorded fallback, and document the gap in README — still closable for #104 when the other three natives work and TB path is explicit.

## Dependencies

- **Task:** SP-181
- Soft: SP-182, SP-183, SP-184 (prefer landing after so e2e live smoke covers three natives)

## Context to Read First

- `scripts/lib/leaderboard-adapters/`
- `tests/fixtures/benchmark-leaderboards/terminal_bench.json`
- `README.md` — Benchmark profile refresh section
- `spine-tasks/_authoring/live-leaderboard-adapters-20260710.md`
- GitHub #104
- Prior research: HF `harborframework/terminal-bench-2-leaderboard` is submissions-only; Parse API needs key

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/lib/leaderboard-adapters/terminal-bench.ts`, `README.md` |
| May change | `tests/unit/leaderboard-adapters/terminal-bench.test.ts`, `scripts/lib/leaderboard-adapters/index.ts`, `tests/fixtures/benchmark-leaderboards/recorded/terminal_bench.json`, `scripts/release-refresh-benchmark-profiles.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/leaderboard-adapters/swebench-verified.ts`, `scripts/lib/leaderboard-adapters/livecodebench.ts`, `scripts/lib/leaderboard-adapters/bfcl.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/leaderboard-adapters/terminal-bench.test.ts` |
| fileScopeMustChange | `scripts/lib/leaderboard-adapters/terminal-bench.ts`, `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/leaderboard-adapters/swebench-verified.ts`, `scripts/lib/leaderboard-adapters/livecodebench.ts`, `scripts/lib/leaderboard-adapters/bfcl.ts` |
| completionCriteria | TB adapter + documented live source (or operator --live-url schema); README lists all four live sources; offline unit tests; no invented scores; #104 closable. |

## Steps

### Step 1: Lock Terminal-Bench live source

- [ ] Investigate free public aggregates; document chosen URL or operator-mirror schema in adapter + README
- [ ] Reject paid Parse API as default
- [ ] Implement adapter for chosen format → fixture entries + model_id mapping

### Step 2: Operator docs + e2e smoke notes

- [ ] README: live source table for all four benchmarks + per-benchmark fallback
- [ ] Ensure `--live` / `release:refresh-benchmarks` docs match behavior
- [ ] Offline unit sample for TB adapter

### Step 3: Testing and verification

- [ ] Run contract `testCommand`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage
- [ ] Manual note in STATUS: result of `npm run routing:ingest-benchmarks -- --live` (which benches live vs fallback)

## Completion Criteria

- [ ] TB path explicit (live or documented mirror + fallback)
- [ ] README updated for all four sources
- [ ] #104 acceptance met
- [ ] No invented scores

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Must Update | `README.md` (Benchmark profile refresh — live sources table) |

## Git Commit Convention

- `feat(SP-185): description`

## Do NOT

- Default to paid Parse API
- Invent Terminal-Bench scores
- Touch other adapter implementation files
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump npm version / publish

---

## Amendments (Added During Execution)

(none yet)
