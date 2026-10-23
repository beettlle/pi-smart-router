# Task: SP-301 — persist context-fit telemetry fields

**Created:** 2026-10-22
**Size:** S

## Review Level: 2

**Assessment:** Observability bug — routing telemetry computes the context-fit fields but the `telemetry` SQLite table has no columns for them, so admits like the 148,508-token turn in #178 can't be diagnosed.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#178
- Epic: beettlle/pi-smart-router#182
- Release: v1.2.2
- Bucket: bug
- Partial: #178 (observability half; SP-302 fixes the estimator)

## Mission

`src/infrastructure/telemetry/routing-telemetry.ts` already builds each record with `estimated_input_tokens`, `context_fit_viable_count`, `context_fit_rejected_json`, `context_overflow_pin_break`, `selected_model_max_input_tokens` and `context_fit_reason_code`. The `telemetry` table created in `src/infrastructure/persistence/sqlite-store.ts` (~L82) and its insert statement (~L700–760) do not include them, so they are dropped. (The separate `dataset` table does store `estimated_input_tokens`.)

- Add the missing columns to `telemetry` with an additive, idempotent migration that follows the file's existing `ALTER TABLE telemetry ADD COLUMN …` pattern and migration versioning.
- Persist them in the insert (and in the update path if the same row is rewritten).
- Mirror the change in the in-memory store if it keeps a telemetry row shape, so tests and the memory backend match SQLite.
- Existing databases without the columns must open and migrate cleanly; old rows read back as `null`.

## Dependencies

- None

## Context to Read First

- `src/infrastructure/persistence/sqlite-store.ts` (telemetry schema, migrations, insert/update)
- `src/infrastructure/persistence/memory-store.ts`
- `src/infrastructure/telemetry/routing-telemetry.ts` (~L280–330)
- `tests/unit/memory-store-telemetry.test.ts`, `tests/unit/routing-telemetry.test.ts`
- Issue beettlle/pi-smart-router#178

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/persistence/sqlite-store.ts`, `tests/unit/sqlite-store-context-fit-telemetry.test.ts` |
| May change | `src/infrastructure/persistence/memory-store.ts`, `src/domain/types/**` (row type only), `tests/unit/memory-store-telemetry.test.ts` |
| Must NOT change | `package.json`, `.pi/extensions/smart-router/routing-context.ts`, `src/domain/delegation/**`, `src/domain/matching/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/sqlite-store-context-fit-telemetry.test.ts tests/unit/memory-store-telemetry.test.ts tests/unit/routing-telemetry.test.ts` |
| fileScopeMustChange | `src/infrastructure/persistence/sqlite-store.ts`, `tests/unit/sqlite-store-context-fit-telemetry.test.ts` |
| fileScopeMustNotChange | `package.json`, `.pi/extensions/smart-router/routing-context.ts` |
| completionCriteria | Context-fit fields round-trip through SQLite telemetry; migration additive and idempotent on an old DB; tests green |

## Steps

### Step 0: Preflight

- [ ] Read the telemetry migration chain and the insert/update statements; list which context-fit fields are missing

### Step 1: Implementation

- [ ] Additive migration for the missing columns
- [ ] Persist the fields in insert/update; memory store parity

### Step 2: Testing & Verification

- [ ] Test: a telemetry row with all context-fit fields round-trips through a temp SQLite DB
- [ ] Test: a DB created with the pre-migration telemetry schema opens, migrates, and reads old rows with `null` fields
- [ ] Test: running the migration twice is a no-op
- [ ] Run Contract `testCommand`

## Do NOT

- Change how the estimate is computed (SP-302)
- Drop or rename existing columns

## Completion Criteria

- [ ] #178 acceptance item "telemetry rows include `estimated_input_tokens`" met
- [ ] Contract tests green
