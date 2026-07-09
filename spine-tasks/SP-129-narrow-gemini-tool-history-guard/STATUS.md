**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-08
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Narrow replay-risk detector

**Status:** Complete

- [x] Add hasGoogleReplayRisk using SP-127 Google-origin helpers
- [x] Replace hasToolCallHistory usage in resolveEffectiveFleet
- [x] Remove hard Gemini exclusion when repair path applies

## Step 2: Align SP-080 deprioritize

**Status:** Complete

- [x] Update prioritizeFleetForToolHistory to use same detector
- [x] Keep deprioritize semantics for residual Google replay risk if any

## Step 3: Tests

**Status:** Complete

- [x] OpenAI tool history + Gemini in fleet — Gemini not excluded
- [x] Update extension tests that assumed SP-077 blunt exclusion
- [x] SP-084 empty-fleet behavior still correct for edge cases

## Step 4: Testing and verification

**Status:** Complete

- [x] Run npm run typecheck && npm run lint && npm test

---

## Completion Criteria

- [x] OpenAI-only tool sessions can route to economical Gemini
- [x] Google tool sessions rely on SP-128 repair, not blunt ban
- [x] Telemetry reason code preserved where exclusion still applies
- [x] Tests pass

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-08 | 4 | plan | REVISE (ESLint) — fixed |
| 2026-07-08 | 4 | plan | skipped (engine post-.DONE) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-08 | Implementation | Narrowed guard uses hasGoogleReplayRisk + unrepairable state for exclusion only |
| 2026-07-08 | REVISE fix | void messages pattern for hasGoogleReplayRisk ESLint gate |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

GitHub #85. Blocked on SP-127. Supersedes SP-077 exclusion semantics.
