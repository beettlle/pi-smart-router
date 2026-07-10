**Current Step:** Step 1
**Status:** Pending
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Gate config and assertion module

**Status:** Pending

- [ ] Add `config/release-gates.json` with zod-validated schema (`version`, `absolute_gates`)
- [ ] Implement pure `assertAbsoluteGates(metrics, config)` returning pass/fail + failed gate list
- [ ] Threshold keys: `mean_capability_adequacy_rate_min`, `mean_quality_retention_min`, `mean_over_routing_rate_max`, `mean_pin_preserved_rate_min`

## Step 2: CLI entry

**Status:** Pending

- [ ] Implement `assert-release-gates.ts` with `--metrics`, `--fixtures`, `--config`
- [ ] `--fixtures` runs `runHarnessOnDir()` then asserts
- [ ] Structured stderr on failure; exit 0/1

## Step 3: Testing and verification

**Status:** Pending

- [ ] Unit tests: pass with current fixture metrics; fail when threshold violated
- [ ] Run `npm run verify:ci`

---

## Completion Criteria

- [ ] `config/release-gates.json` with validated schema
- [ ] `assert-release-gates.ts` CLI with metrics and fixtures modes
- [ ] Unit tests for pass and fail paths
- [ ] `npm run verify:ci` passes

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
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
