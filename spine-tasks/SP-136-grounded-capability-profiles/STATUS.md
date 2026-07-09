**Current Step:** 3
**Status:** In Progress
**Last Updated:** 2026-07-09
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Profile loader

- [x] Load ingested benchmark artifact at mapper init
- [x] Map model id → capability vector from benchmark dimensions

## Step 2: Mapper integration

- [x] Replace static regex defaults when benchmark row exists
- [x] Preserve fallback for unknown models

## Step 3: Testing and verification

- [x] Unit tests: known model gets benchmark scores; unknown falls back
- [x] Integration test: shortfall uses grounded profile
- [x] Run `npm run verify:ci`

## Completion Criteria

- [x] Capability profiles grounded in benchmark data when available
- [x] Regex fallback for missing models
- [x] Tests prove behavior change vs hardcoded 0.95
- [x] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

- `npm run routing:ingest-benchmarks` CLI fails under plain Node (missing `.js` shim for `scripts/lib/ast-tool-validation.ts`); vitest/tsx path works. SP-137 may address CI ingest wiring.
