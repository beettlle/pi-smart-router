**Current Step:** Step 3
**Status:** Complete
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

**Status:** Complete

- [x] Update `release.yml` to run `release:check` or `release:functional-smoke` on tag path
- [x] Document Tier 0 gate chain in README release section

## Step 3: Testing and verification

**Status:** Complete

- [x] Run `npm run release:check` locally on main
- [x] Confirm failure when gate thresholds intentionally violated (via SP-165 unit test)

---

## Completion Criteria

- [x] `release:functional-smoke` script added
- [x] `release:check` includes Tier 0 functional smoke
- [x] `release.yml` updated
- [x] README documents gate chain
- [x] `npm run release:check` passes on main

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | Step 3 | plan | Skipped (engine runs after .DONE) |
| 2026-07-10 | Step 2 | plan | Skipped (engine runs after .DONE) |
| 2026-07-10 | Step 1 | plan | Skipped (engine runs after .DONE) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Pre-existing `routing:verify-calibration` CLI import failure; `--skip-embed` routes to vitest smoke in package.json | Functional smoke passes without ONNX embed |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | release:check | `npm run release:check` exit 0 (~31s); SP-165 fail-path tests pass |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
