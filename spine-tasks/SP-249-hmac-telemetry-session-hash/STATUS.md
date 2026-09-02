# SP-249: HMAC-pepper hashSessionIdForTelemetryExport — Status

**Current Step:** 0
**Status:** Not Started
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ⬜ Not Started

- [ ] Read current hash + dataset pepper loader
- [ ] Decide shared util vs import existing loader

## Step 1: HMAC hash in infra telemetry

**Status:** ⬜ Not Started

- [ ] Implement HMAC-pepper `hashSessionIdForTelemetryExport`
- [ ] Ensure pepper never appears in export payloads
- [ ] Keep export field name `session_id_hash` unless schema already versions another name

## Step 2: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Unit tests: stable hash; no raw session id in built export rows
- [ ] Contract `testCommand` green

## Completion Criteria

- [ ] Infra telemetry hash uses HMAC+pepper; Partial #146

## Discoveries

- (none yet)
