# SP-263 — Bump runtime peers to pi 0.85.1 and align minPiVersion. — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Confirm npm latest peers are 0.85.1 — pi-ai@0.85.1 and pi-coding-agent@0.85.1 are npm latest
- [x] Note current minPiVersion — was `0.80.8`

## Step 1: Bump peers + lockfile

**Status:** Complete (plan review skipped — engine-owned, SP-195)

- [x] Update dependency ranges to ^0.85.1
- [x] npm install; align minPiVersion — lockfile resolves pi-ai@0.85.1 + pi-coding-agent@0.85.1; minPiVersion set to `0.85.1` (peer floor of ^0.85.1)
- [x] Fix compile breaks if any — none; `tsc --noEmit` clean on 0.85.1

## Step 2: Testing & Verification

**Status:** Complete (operator land-loop 2026-09-06)

- [x] Run contract testCommand (`npm run release:check`) — green on main after lane salvage/merge (EXIT 0; 2169 tests)
- [x] STATUS records installed versions — pi-ai@0.85.1, pi-coding-agent@0.85.1, minPiVersion=0.85.1

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
| 2026-09-06 | Preflight | npm latest pi-ai/pi-coding-agent = 0.85.1; prior minPiVersion 0.80.8 |
| 2026-09-06 | Step 1 | Ranges bumped to ^0.85.1; npm install resolved 0.85.1; minPiVersion → 0.85.1; typecheck clean |
| 2026-09-06 | Operator land-loop | Worker exited without `.DONE` mid Step 2; peers already on main; `npm run release:check` green; `.DONE` written |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
