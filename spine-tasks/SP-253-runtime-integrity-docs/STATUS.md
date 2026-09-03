# SP-253: Operator docs for runtime-integrity theme — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-09-03
**Review Level:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** ✅ Complete

- [x] Read SP-248/250/252 STATUS for final names, version bump, config keys

## Step 1: Author theme docs in README

**Status:** 🔄 In Progress

- [ ] Long-session eviction note
- [ ] Export-hash migration note
- [ ] Degraded-mode reason-code + fail_closed table/section

## Step 2: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Confirm README paths match shipped APIs (no invented knobs)
- [ ] Contract `testCommand` (`true`) — docs-only
- [ ] Full suite optional: `npm test` if local env allows; do not change product code to force green

## Completion Criteria

- [ ] Theme docs complete and accurate to landed SP-248/250/252

## Discoveries

- Preflight verified shipped names: `evictInMemorySessionState` (`src/api/session-eviction.ts`) wired into the extension `session_shutdown` handler (`session-lifecycle.ts`); `ORPHAN_SESSION_TTL_MS = 24h`, swept on `session_start`, fail-open.
- Contrib export `TELEMETRY_CONTRIB_VERSION = 2` (`src/cli/smart-router-cli.ts`); `session_id_hash` = HMAC-SHA256 keyed with install-local pepper `.pi-smart-router/.dataset-key` (mode 0600), never exported. v1 hashes (unsalted SHA-256) not comparable with v2 → re-baseline.
- Reason codes: `hydra_weights_missing` / `k4_heads_placeholder` (`src/domain/matching/missing-weights-reason-codes.ts`); knob `degraded_route.fail_closed_on_missing_weights` (Zod, default false, `src/domain/types/schemas.ts`); fail-closed throws before embedding cost and enters the degraded sandwich as `neural_misconfigured`.
