**Current Step:** Step 1
**Status:** In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 1: package.json scripts

**Status:** Complete

- [x] Add `release:functional-smoke` chaining calibration verify, benchmark profiles, assert-release-gates --fixtures
- [x] Extend `release:check` to include `release:functional-smoke` after consumer-pack

## Step 2: Release workflow and docs

**Status:** Pending

- [ ] Update `release.yml` to run `release:check` or `release:functional-smoke` on tag path
- [ ] Document Tier 0 gate chain in README release section

## Step 3: Testing and verification

**Status:** Pending

- [ ] Run `npm run release:check` locally on main
- [ ] Confirm failure when gate thresholds intentionally violated (via SP-165 unit test)

---

## Completion Criteria

- [ ] `release:functional-smoke` script added
- [ ] `release:check` includes Tier 0 functional smoke
- [ ] `release.yml` updated
- [ ] README documents gate chain
- [ ] `npm run release:check` passes on main

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
