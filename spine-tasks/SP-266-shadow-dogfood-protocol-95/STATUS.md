# SP-266 — Harden shadow dogfood protocol and release-gate soft-feed wiring. — Status

**Current Step:** done
**Status:** Complete
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Read existing protocol + release-gates
- [x] Identify soft-feed gaps

Findings: (1) `scripts/eval/dogfood-track-b-adapter.ts` is library-only — no CLI/npm script wires a dogfood Track B export into release gates, so operators cannot attach dogfood exports to gates without hand-writing fixtures. (2) Protocol doc lacks exact soft-feed dry-run commands and explicit pass/fail criteria for frugality-relaxation evidence. (3) `assert-release-gates.ts` already supports `--report-only` + `--config` override — reuse, do not edit `config/release-gates.json`.

## Step 1: Protocol + soft-feed

**Status:** Complete

- [x] Harden docs/commands
- [x] Wire soft-feed if code gaps exist

Delivered: new CLI `scripts/qa/dogfood-soft-feed.ts` + npm script `qa:dogfood-soft-feed` (dogfood Track B export → harness fixtures → absolute gates, report-only, always exit 0 on PASS/soft-FAIL/SKIP; exit 1 only on operator error). Protocol doc gained "Attach dogfood exports to release gates (soft-feed dry-run)" section with exact commands, skip semantics, and a pass/fail table for frugality-relaxation evidence; sign-off form extended. README cross-links added. `config/release-gates.json` untouched; frugality defaults untouched.

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green
- [x] STATUS lists operator command sequence

Evidence: `npm run typecheck` green (tsc --noEmit, no errors). `npm test` green: 121 files / 2164 tests passed. `npm run lint` green. CLI verified end-to-end: synthetic labeled export → PASS exit 0; incomplete labels → SKIP exit 0; invalid JSON / missing file → exit 1.

### Operator command sequence (#95 shadow dogfood + soft-feed)

1. `npm install` (once), enable extension, `/model smart-router/auto` in pi
2. `export SMART_ROUTER_DATASET=1` (optional `SMART_ROUTER_LOG_ROUTING=1`)
3. Run session matrix rows 1–6; `/smart-router status|history|stats` after each
4. `/smart-router export dataset` + `/smart-router export telemetry-contrib`; privacy check (no prompt bodies)
5. `npm run qa:shadow-dogfood` — hard fixture gates (must pass) + TwinRouterBench corpus soft-report (soft FAIL on over-routing expected; exit 0); archives under `.pi-smart-router/qa-runs/<ts>/`
6. `npm run qa:dogfood-soft-feed -- --export <track-b-export.json>` — attach labeled dogfood export to absolute gates, dry-run (exit 0 on PASS/soft-FAIL/SKIP; exit 1 only on operator error; optional `--out`, `--config`, `--baseline-version`)
7. Fill sign-off form in `docs/qa/shadow-dogfood-protocol.md`; post to #95

Frugality relaxation evidence bar (NOT done here): repeated over-routing-only soft FAILs across ≥2 windows + hard gates green + separate operator-approved packet.

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-06 | 0 | plan | skipped (engine-run post-.DONE, SP-195) |
| 2026-09-06 | 1 | plan | skipped (engine-run post-.DONE, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | Track B adapter was library-only — no operator path to attach dogfood exports to gates | Added qa:dogfood-soft-feed CLI wiring export → fixtures → report-only gates |
| 2026-09-06 | Baseline regression vs fixture baselines is not meaningful for dogfood corpora | Soft-feed defaults to absolute gates; --baseline-version opt-in |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | Preflight; gaps identified (library-only Track B adapter, missing soft-feed docs) |
| 2026-09-06 | Step 1 complete | Added scripts/qa/dogfood-soft-feed.ts + qa:dogfood-soft-feed; protocol soft-feed section + pass/fail table; README cross-links |
| 2026-09-06 | Step 2 complete | typecheck + lint + 2164 tests green; CLI verified PASS/SKIP/error paths |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
