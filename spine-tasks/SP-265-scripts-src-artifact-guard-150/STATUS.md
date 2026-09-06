# SP-265 — Stop silent drift of committed scripts/src compile artifacts. — Status

**Current Step:** 2
**Status:** Complete
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Inventory scripts/src vs src duplicates
- [x] Choose remove vs CI-guard approach; record in STATUS

**Decision (Step 0):** Remove tracked artifacts AND add CI drift guard (both).

Inventory findings:
- `scripts/src/**` — 40 tracked compiled files (.js/.d.ts/.map) duplicating `src/{config,domain}/**`; already drifted (e.g. triage-engine: 317 compiled lines vs 424 source lines). Zero importers anywhere (grep across scripts/tests/src/bin/extensions).
- `scripts/calibration-aggregate.{js,js.map,d.ts,d.ts.map}` — stale compiled siblings of `calibration-aggregate.ts`; all importers use `./calibration-aggregate.js` specifiers that tsx/vitest remap to the `.ts` source.
- Bonus discovery: `routing:bootstrap-centroids`, `routing:calibration-aggregate`, `routing:train-calibration` npm scripts use `node --experimental-strip-types`, which does NOT remap `.js`→`.ts` specifiers — these entrypoints are broken today. Fix: switch to `tsx` (already a devDependency, used by other routing:* scripts). `routing:test-projection` imports from `../dist/` after `npm run build`, so it is fine and stays unchanged.

Approach:
1. `git rm` scripts/src/** and calibration-aggregate compiled siblings.
2. `.gitignore`: ignore compiled artifacts under `scripts/`.
3. New guard `scripts/assert-no-script-artifacts.sh` (fails if compiled artifacts tracked under scripts/), wired into `ci.yml` and `release:check`.
4. Switch broken strip-types npm scripts to `tsx`.

## Step 1: Implement hygiene

**Status:** Complete

- [x] Remove tracked artifacts and/or add CI drift guard
- [x] Keep documented entrypoints working

Removed 44 tracked compiled artifacts; added `scripts/assert-no-script-artifacts.sh` guard (wired into ci.yml + release:check); .gitignore blocks re-tracking; fixed 3 broken `node --experimental-strip-types` entrypoints by switching to tsx (all `--help` smokes pass; guard negative test passes).

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green
- [x] Confirm calibration script entry still documented

Verification evidence:
- `npm test` — 121 files, 2164 tests passed.
- `npm run typecheck` — clean.
- `npm run release:check` — green (exit 0) with documented `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1`; live refresh failure reproduced on clean `main` (pre-existing upstream leaderboard drift, out of scope).
- Guard ran first in release:check (`scripts/: no tracked compiled artifacts`); negative test (force-added .js probe) fails with exit 1.
- `npm run routing:calibration-aggregate -- --help` works via tsx; README.md:724/790/801/1134 documentation unchanged and accurate.

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | `node --experimental-strip-types` entrypoints (routing:bootstrap-centroids, routing:calibration-aggregate, routing:train-calibration) were broken — no `.js`→`.ts` specifier remapping | Fixed by switching to tsx |
| 2026-09-06 | `release:refresh-benchmarks` fails on clean `main` too (live leaderboard fetch drift; exits 1 with uncommitted fixture changes) | Pre-existing, unrelated to SP-265; using documented `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1` offline skip for release:check verification |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | Inventory done; chose remove + CI-guard approach |
| 2026-09-06 | Step 1 complete | Removed 44 artifacts; guard + gitignore + tsx entrypoints; typecheck & calibration tests green |
| 2026-09-06 | Step 2 complete | npm test 2164 pass; typecheck clean; release:check green (offline skip); calibration entrypoint documented & working |
| 2026-09-06 | Task complete | All completion criteria met; .DONE created |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
