# SP-232: Expand Gemini tool-history guard + README — Status

**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-08-27
**Review Level:** 1
**Size:** M

---

## Step 1: Expand tool-history guard

**Status:** ✅ Complete (plan review engine-skipped per SP-195)

- [x] Exclude Gemini / prefer non-Google with reason_code
- [x] Empty-fleet actionable path

## Step 2: README + tests

**Status:** ✅ Complete (plan review engine-skipped per SP-195)

- [x] README repair/reroute primary
- [x] Guard unit tests

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Contract `testCommand`
- [x] `npm test` + coverage gate

---

## Completion Criteria

- [x] #158 AC met (guard + docs)
- [x] Issue closable

## Discoveries

- GitNexus MCP tool params are truncated to first char in this worker session (harness bug); used grep-based impact analysis instead — guard predicates only consumed by `route-and-delegate.ts` / `index.ts` re-export / guard tests (LOW risk).
- SP-231 sentinel repair covers unsigned cross-provider toolCalls (its extension test routes unsigned history to Gemini in a mixed fleet), so the guard must NOT exclude on unsigned-only history. SP-232 expansion targets repair-unsafe state: any-origin redacted thinking and foreign (non-Google) signatures that repair preserves but Google rejects.
- New guard detectors: `hasCrossProviderUnrepairableReplayStateFromContext` (redacted thinking any origin; foreign thinkingSignature/textSignature/toolCall thoughtSignature excluding the skip sentinel) gated by `hasUnrepairableCrossProviderReplayRiskFromContext` (requires tool history). `resolveEffectiveFleet` now excludes Gemini on `hasUnrepairableGoogleReplayRiskFromContext || hasUnrepairableCrossProviderReplayRiskFromContext`.
- Extension coverage: reroute test asserts dispatch receives Gemini-free effectiveFleet and delegates to openai; google-only fleet + foreign-signed history rejects with GeminiToolHistoryEmptyFleetError without delegating.

## Verification Evidence

- `npm run typecheck` — clean
- Contract testCommand (`npm run typecheck && npx vitest run tests/unit/tool-history-guard.test.ts tests/unit/delegation-context.test.ts tests/unit/smart-router-extension.test.ts`) — 143/143 pass
- `npm test` — 113 files, 1914/1914 pass
- `npm run coverage:check` — exit 0; `tool-history-guard.ts` 93.07% lines (≥77%), total 93.05%
- Plan reviews Steps 1–3: engine-skipped in worker session (SP-195); engine runs reviews after .DONE
- gitnexus detect_changes (pre-commit): 0 changed symbols, risk low; GitNexus `impact`/`context` param harness bug noted above
