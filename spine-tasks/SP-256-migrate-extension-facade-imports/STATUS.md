# SP-256 — Migrate extension deep src imports to facade — Status

**Current Step:** Step 2: Complete
**Status:** Complete
**Last Updated:** 2026-09-05
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Confirm facade coverage — SP-255 STATUS: all 97 inventoried symbols exported from `src/index.ts` (117 total exports)
- [x] Baseline deep-import count: **78** matches of `from '../../../src/` across 17 files under `.pi/extensions/smart-router`

## Step 1: Migrate imports

**Status:** Complete

- [x] Rewrite extension imports — 78 deep `../../../src/**` imports + 2 `export ... from` re-exports consolidated to facade `../../../src/index.js` across 17 files (codemod + manual fix for re-exports)
- [x] Minimal facade gap-fill: added `hasToolCallHistory`, `hasToolCallHistoryFromContext` to `src/index.ts` (re-exported by extension `index.ts`; only missing symbols)
- [x] Deep-import count → **0** (31 remaining `../../../src/index.js` facade references are the intended pattern)

## Step 2: Testing & Verification

**Status:** Complete

- [x] typecheck + tests green — `npm run typecheck` clean; `npm test` 120 files / 2155 tests passed
- [x] STATUS before/after counts — before: 78 deep subpath imports; after: 0 deep subpath imports, 31 facade (`src/index.js`) references

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-05 | Bare self-reference `from 'pi-smart-router'` does NOT resolve in vitest (vite resolver fails; no node_modules self-link, dist not built) and `vitest.config.ts` is out of scope (SP-258) | Import pattern: documented relative facade path `from '../../../src/index.js'` (package entry, public exports only). Deep subpath imports (`../../../src/<subpath>`) go to 0; SP-257 guard should ban subpaths while allowing `src/index.js` |
| 2026-09-05 | Facade gap: extension `index.ts` re-exports `hasToolCallHistory` / `hasToolCallHistoryFromContext` which SP-255 had not exported | Added minimal exports to `src/index.ts` (allowed May-change) |
| 2026-09-05 | Extension `index.ts` uses `export ... from` re-exports (not imports) for 2 src modules — codemod handled imports only; re-exports rewritten manually | Deep-import regex for SP-257 should cover `export ... from` too |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-05 | Step 0 complete | Facade coverage confirmed (SP-255, 117 exports); baseline 78 deep imports |
| 2026-09-05 | Plan review Step 1 | spine_review_step skipped (engine-owned per SP-195) |
| 2026-09-05 | Step 1 complete | All extension imports/re-exports on facade; 0 deep subpath imports |
| 2026-09-05 | Step 2 complete | typecheck clean; 120 test files / 2155 tests green |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

