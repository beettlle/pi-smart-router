# SP-228: CI quality gates on src and extension — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** M

---

## Step 1: Update workflow path filters

**Status:** Complete

- [x] eval-harness-smoke paths
- [x] calibration-verify paths

## Step 2: Document operator gate set

**Status:** Complete

- [x] verify:ci / README gate list

## Step 3: Testing and verification

**Status:** Complete

- [x] Contract `testCommand` (`npm run verify:ci` — exit 0; workflow YAML parsed successfully)

---

## Completion Criteria

- [x] Workflows trigger on routing edits (eval-harness-smoke: `src/**`, `.pi/extensions/smart-router/**`; calibration-verify: `src/domain/routing|pipeline|types/**`, `src/cli/**`)
- [x] Operator docs updated (README: gate-set table, verify:ci row, CI smoke + calibration verify trigger notes)
- [x] #135 closable (branch-protection required-check policy remains human-operator repo-settings decision, noted in README)
