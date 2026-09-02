# SP-249: HMAC-pepper hashSessionIdForTelemetryExport — Status

**Current Step:** 2
**Status:** Complete
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ✅ Complete

- [x] Read current hash + dataset pepper loader
- [x] Decide shared util vs import existing loader → import existing `loadOrCreateDatasetPepper` from `dataset-recorder.ts` (one pepper loader, no second pepper file)

## Step 1: HMAC hash in infra telemetry

**Status:** ✅ Complete

- [x] Implement HMAC-pepper `hashSessionIdForTelemetryExport`
- [x] Ensure pepper never appears in export payloads
- [x] Keep export field name `session_id_hash` unless schema already versions another name

## Step 2: Testing & Verification

**Status:** ✅ Complete

- [x] Unit tests: stable hash; no raw session id in built export rows
- [x] Contract `testCommand` green

## Completion Criteria

- [x] Infra telemetry hash uses HMAC+pepper; Partial #146

## Discoveries

- `loadOrCreateDatasetPepper` from `dataset-recorder.ts` reused directly (single pepper loader, `.dataset-key` mode 0600, gitignored). No second pepper file.
- `hashSessionIdForTelemetryExport(sessionId, pepper?)` — pepper optional; memoized default avoids per-record file I/O in JSONL builders. Pepper threaded through `toCommunityTelemetryRecord` / `toHydraCalibrationRecord` / `format*Jsonl` as optional param (backward compatible).
- Tests pass explicit peppers (hermetic); assert HMAC ≠ unsalted SHA-256, cross-pepper non-correlation, and pepper hex never in JSONL.
- Verification: typecheck ✅, `npx vitest run tests/unit/telemetry-export.test.ts` ✅ (8 tests), full `npm test` ✅ (2096 tests, 118 files), lint ✅, `npm run coverage:check` ✅ (telemetry.ts 95% lines).
- Plan review requested at Step 1 (Review Level 1) — skipped by engine (worker sessions: engine-owned reviews after .DONE).
