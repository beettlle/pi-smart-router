## Summary

Replace unsalted SHA-256 community telemetry session hashes with HMAC-pepper scheme aligned to dataset fingerprint privacy.

## Priority

P1

## Pipeline stages

`src/infra/telemetry.ts`, `src/cli/smart-router-cli.ts`, contrib export paths

## Problem / motivation

Community/session export uses unsalted SHA-256 of raw `session_id` (`src/infra/telemetry.ts` ~41–43; duplicated in CLI). Dataset fingerprints correctly use HMAC + install pepper (`dataset-recorder.ts`). Community export is the weaker privacy path (Grok audit P1).

## Proposed solution

- [ ] Implement `hashSessionIdForTelemetryExport` using HMAC + pepper file (reuse `.dataset-key` pattern or dedicated pepper path with `0600` perms).
- [ ] Deduplicate CLI vs infra implementation (single module).
- [ ] Update contrib export schema/docs if hash format changes (version bump).
- [ ] Contract tests: export JSONL contains no raw session IDs; hashed form stable per install.
- [ ] Migration note for operators comparing old exports.

## Evidence

- `src/infra/telemetry.ts` ~41–43
- `src/cli/smart-router-cli.ts` ~263
- `src/infrastructure/telemetry/dataset-recorder.ts` — HMAC reference

## Dependencies

None.

## Out of scope

- Storing raw session IDs in telemetry (already forbidden)
- #110 calibration exports

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/smart-router-cli.test.ts
npx vitest run tests/unit/telemetry-export.test.ts  # or equivalent
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Implement + tests | Autonomous |
