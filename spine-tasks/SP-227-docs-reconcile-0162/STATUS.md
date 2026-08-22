# SP-227: Reconcile docs with 0.16.2 runtime — Status

**Current Step:** Done (all steps complete)
**Status:** Complete
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** M

---

## Step 1: Fix operator-config example and CI test

**Status:** Complete

- [x] Example passes OperatorConfigSchema
- [x] CI test loads example file

## Step 2: Refresh operator-facing docs

**Status:** Complete

- [x] README, quickstart, roadmap updates

## Step 3: Testing and verification

**Status:** Complete

- [x] Contract `testCommand` — `npm run typecheck && npm run lint` both pass
- [x] `npm run verify:ci` — exit 0 (build + typecheck + lint + coverage:check; 113 files / 1877 tests passed)

---

## Completion Criteria

- [x] Docs and example config accurate — example validates via `OperatorConfigSchema` in `tests/unit/operator-config.test.ts`; README banner v0.16.2; quickstart dataset shipped + Node >=22; roadmap refreshed 2026-08-22 with closed pointers (#108→#124), v0.17 audit table, triage_cloud_fallback in pipeline diagrams
- [x] #152 closable
