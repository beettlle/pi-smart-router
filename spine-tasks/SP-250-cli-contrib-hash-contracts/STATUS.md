# SP-250: CLI dedupe + contrib export contract tests — Status

**Current Step:** 2
**Status:** Complete
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ✅ Complete

- [x] Import SP-249 helper; locate CLI duplicate hash sites

SP-249 helper: `hashSessionIdForTelemetryExport(sessionId, pepper?)` in `src/infra/telemetry.ts` (HMAC-SHA256, install-local `.dataset-key` pepper default).
CLI duplicate sites: `hashSessionIdForContribExport` (unsalted SHA-256, src/cli/smart-router-cli.ts:262), called by `resolveSessionIdHash` + `datasetExportRowToTelemetryContrib`. Tests import it from the CLI.

## Step 1: CLI dedupe + schema version

**Status:** ✅ Complete

- [x] Point CLI at shared helper; remove unsalted duplicate
- [x] Bump export schema/version if hash format changed

`hashSessionIdForContribExport` (unsalted SHA-256) deleted; CLI now uses SP-249 `hashSessionIdForTelemetryExport` (HMAC-SHA256, install-local pepper) with optional pepper threaded through `resolveSessionIdHash` / `toTelemetryContribRecord` / `buildTelemetryContribRecords` / `datasetExportRowToTelemetryContrib`; `exportTelemetryContrib` loads pepper from `ctx.cwd` lazily. Hash format changed → `TELEMETRY_CONTRIB_VERSION` bumped 1→2 and `telemetry-contrib.schema.json` const/description updated. Plan review skipped (engine-owned, SP-195).

## Step 2: Testing & Verification

**Status:** ✅ Complete

- [x] Contract tests for JSONL / contrib rows
- [x] Contract `testCommand` green
- [x] #146 closable with SP-249

Contract tests added: HMAC-not-unsalted assertion, per-pepper stability / cross-pepper non-correlation, JSONL contains no raw session_id/request_id/pepper hex and is schema-valid, pepper fields stripped from serialized output, `exportTelemetryContrib` hash keyed to the `.dataset-key` pepper under export cwd (stable per install/cwd), raw session_id rows hashed via shared helper.

Verification evidence:
- `npm run typecheck` — clean
- `npx vitest run tests/unit/smart-router-cli.test.ts tests/unit/telemetry-export.test.ts` — 27/27 passed
- `npm test` — 119 files, 2117/2117 passed
- `npm run lint` — clean
- `npm run coverage:check` — exit 0 (All files 93.64% lines; smart-router-cli.ts 92.52%, ≥77% gate)
- Plan reviews: skipped in-worker (engine-owned, SP-195)

## Completion Criteria

- [x] CLI + contracts complete; #146 closable

## Discoveries

- SP-253 docs note: contrib export schema bumped to v2 — `session_id_hash` is now install-pepper-keyed HMAC-SHA256 (was unsalted SHA-256 in v1); hashes from pre-v2 exports are not comparable with v2 exports. Migration prose belongs to SP-253 (README untouched here).
- Scope note: `specs/001-build-smart-router/contracts/telemetry-contrib.schema.json` updated (const 1→2 + hash description) — it is the contrib export schema referenced by the version bump, outside the literal `src/**` glob but required by the packet's "bump contrib export schema/version field" instruction.
