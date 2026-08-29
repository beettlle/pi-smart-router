# SP-240: Dependency refresh: pi-ai/pi-coding-agent 0.84.x + lockfile hygiene — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-08-29 (Step 1 in progress)
**Review Level:** 1
**Size:** S

---

## Step 1: Apply version bumps

**Status:** In Progress

- [x] package.json: pi-ai + pi-coding-agent → ^0.84.4; engines.node → >=22.19.0
- [x] npm install; npm update zod tsx
- [x] npm ls verification (0.84.4 / 0.84.4 / 4.5.4 / 4.23.12)
- [x] Lockfile diff review — no unintended transitive majors

## Step 2: Fix fallout (expected: none)

**Status:** Not Started

- [ ] typecheck green; compat-layer equivalents preferred if imports moved

## Step 3: Testing and verification

**Status:** Not Started

- [ ] Contract `testCommand` green
- [ ] Full `npm test` once
- [ ] `npm run release:consumer-pack` green

## Completion Criteria

- [ ] All five Mission-table version changes applied and installed
- [ ] Typecheck, contract tests, full suite, consumer-pack green
- [ ] Lockfile diff scoped; #154 remains open (Partial)
