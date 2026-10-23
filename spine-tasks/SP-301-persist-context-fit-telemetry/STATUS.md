# SP-301: persist context-fit telemetry fields — Status

**Current Step:** Complete — all steps done
**Status:** Complete
**Last Updated:** 2026-10-23
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] List missing context-fit columns in telemetry table

Missing columns in `telemetry` (telemetryRowToEntity returns null literals): `estimated_input_tokens`, `context_fit_viable_count`, `context_fit_rejected_json`, `context_overflow_pin_break`, `selected_model_max_input_tokens`, `context_fit_reason_code`.

---

### Step 1: Implementation
**Status:** Complete

- [x] Additive migration
- [x] Persist fields in insert/update; memory store parity

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Round-trip test
- [x] Old-schema migration test
- [x] Idempotent migration test
- [x] Run Contract testCommand

## Discoveries

- `telemetryRowToEntity` previously returned null literals for all six context-fit fields; insert dropped them entirely. Fixed via MIGRATION_V9 (`estimated_input_tokens`, `context_fit_viable_count`, `context_fit_rejected_json`, `context_overflow_pin_break` (INTEGER NOT NULL DEFAULT 0), `selected_model_max_input_tokens`, `context_fit_reason_code`), `CURRENT_SCHEMA_VERSION` 8→9.
- MemoryStore stores the full `RoutingTelemetry` object, so parity required no store change — only a parity test in `tests/unit/memory-store-telemetry.test.ts`.
- Scope note: `tests/unit/sqlite-store.test.ts` was updated (schema-version assertion 8→9 plus new column assertions) as a necessary consequence of the migration; not listed in File Scope but required to keep tests green.
- Simulated old-DB test needed the full V1 tables (`pins`, `rate_limits` with `bucket_key`, `dataset`) because the constructor prepares statements eagerly and `user_version=8` skips V1.
