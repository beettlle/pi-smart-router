# SP-240: Dependency refresh: pi-ai/pi-coding-agent 0.84.x + lockfile hygiene — Status

**Current Step:** 3 (complete)
**Status:** Complete
**Last Updated:** 2026-08-29 (all steps complete, .DONE)
**Review Level:** 1
**Size:** S

---

## Step 1: Apply version bumps

**Status:** Complete (review engine-owned per SP-195)

- [x] package.json: pi-ai + pi-coding-agent → ^0.84.4; engines.node → >=22.19.0
- [x] npm install; npm update zod tsx
- [x] npm ls verification (0.84.4 / 0.84.4 / 4.5.4 / 4.23.12)
- [x] Lockfile diff review — no unintended transitive majors

## Step 2: Fix fallout (expected: none)

**Status:** Complete — typecheck green, zero fallout

- [x] typecheck green; compat-layer equivalents preferred if imports moved

## Step 3: Testing and verification

**Status:** Complete

- [x] Contract `testCommand` green (typecheck + 4 files, 40/40 tests)
- [x] Full `npm test` once — 116 files, 1943/1943 passed
- [x] `npm run release:consumer-pack` green (verified against pi-coding-agent@0.84.4)

## Completion Criteria

- [x] All five Mission-table version changes applied and installed (pi-ai 0.84.4, pi-coding-agent 0.84.4, zod 4.5.4, tsx 4.23.12, engines.node >=22.19.0)
- [x] Typecheck, contract tests, full suite, consumer-pack green
- [x] Lockfile diff scoped; #154 remains open (Partial)

## Discoveries

- Lockfile diff scoped to the pi-ai/pi-coding-agent 0.84.4 dependency tree + zod/tsx; no runtime major transitive bumps. Notable transitive changes: pi-client/pi-protocol/pi-telemetry 0.84.4 added; @mistralai/mistralai, @opentelemetry/api, zod-to-json-schema removed from the pi-coding-agent subtree.
- Zero type fallout at the 16 pi-ai import sites (15 compat + 1 root `isContextOverflow`).
- In-worker plan review skipped per SP-195 (engine-owned); spawn did not fail.
