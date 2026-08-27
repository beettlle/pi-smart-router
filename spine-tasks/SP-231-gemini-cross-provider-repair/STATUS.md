# SP-231: Broaden Gemini replay repair — Status

**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-08-27
**Review Level:** 1
**Size:** M

---

## Step 1: Broaden repairGeminiReplayContext

**Status:** ✅ Complete

- [x] Sentinel on all unsigned toolCalls for Google targets
- [x] Preserve signatures; keep Google-origin behavior

## Step 2: Unit and extension coverage

**Status:** ✅ Complete

- [x] Non-Google → Google repair tests
- [x] Extension multi-turn path covered

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Contract `testCommand`
- [x] `npm test` + coverage gate

---

## Completion Criteria

- [x] Cross-provider repair shipped with tests
- [x] Phase 1 of #158 ready for SP-232

## Discoveries

- `repairGeminiReplayContext` now repairs **every** assistant message when the
  target is a Google delegation model: unsigned toolCalls get
  `GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL` and identity aligns to the target so
  pi-ai isSameModel replay keeps the sentinel. Captured signatures preserved.
- Tool-history guard (SP-232 scope) only excludes Gemini on *unrepairable
  Google-origin* state, so non-Google tool history routes to Gemini and now
  hits the repaired context — extension test covers this end to end.

## Verification Evidence

- `npm run typecheck` — clean
- Contract testCommand (`npx vitest run tests/unit/delegation-context.test.ts tests/unit/smart-router-extension.test.ts`) — 101/101 pass
- `npm test` — 113 files, 1897/1897 pass
- `npm run coverage:check` — exit 0; `delegation-context.ts` 90.66% lines (≥77%), total 93.15%
- Plan reviews Step 1/2: engine-skipped in worker session (SP-195); engine runs reviews after .DONE
