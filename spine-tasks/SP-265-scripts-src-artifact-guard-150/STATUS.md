# SP-265 — Stop silent drift of committed scripts/src compile artifacts. — Status

**Current Step:** 1
**Status:** In Progress
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

**Status:** Not Started

- [ ] Remove tracked artifacts and/or add CI drift guard
- [ ] Keep documented entrypoints working

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green
- [ ] Confirm calibration script entry still documented

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | Inventory done; chose remove + CI-guard approach |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
