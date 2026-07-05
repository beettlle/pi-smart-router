# Task: SP-056 — Dataset Schema

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Add privacy-safe RoutingDatasetRecord type, SQLite v2 dataset table, and StorePort persistence methods.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#6
- Bucket: feature

## Mission

Add persistence layer for privacy-safe routing dataset records (Tier 1), separate from existing ops telemetry.

Tasks:
- Add `RoutingDatasetRecord` type — **no prompt fields**
- Fields: `request_id`, `timestamp`, `turn_type`, `stage`, `reason_code`, `selected_model_id`, `tier`, `candidates_json`, `prompt_length_chars`, `estimated_input_tokens`, `message_count`, `has_tool_context`, `compaction_flag`, triage summary fields, `requirement_reasoning` / `requirement_code_gen` / `requirement_tool_use`, `routing_latency_ms`, `estimated_cost_usd`
- SQLite migration v2: `dataset` table (separate from `telemetry`)
- Extend `StorePort`: `appendDatasetRecord`, `listDatasetRecords`, retention trim
- Mirror in `MemoryStore` + tests

## Dependencies

- SP-055

## Context to Read First

- `src/domain/types/entities.ts` — `RoutingTelemetry` (ops audit; dataset is separate)
- `src/domain/types/store-port.ts`
- `src/infrastructure/persistence/sqlite-store.ts` — `CURRENT_SCHEMA_VERSION = 1`
- `src/infrastructure/persistence/memory-store.ts`
- `tests/unit/sqlite-store.test.ts`
- `src/infrastructure/telemetry/telemetry-limits.ts` — retention pattern reference

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/entities.ts`, `src/domain/types/store-port.ts`, `src/infrastructure/persistence/sqlite-store.ts`, `src/infrastructure/persistence/memory-store.ts` |
| May change | `tests/unit/sqlite-store.test.ts`, `tests/unit/memory-store.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts`, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/persistence/sqlite-store.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | RoutingDatasetRecord type exists with no prompt fields; SQLite v2 dataset table migrated; StorePort append/list/trim implemented in SQLite and MemoryStore; unit tests pass. |

## Steps

### Step 1: Add RoutingDatasetRecord type

- [ ] Define `RoutingDatasetRecord` in `entities.ts` with all Tier 1 fields from #6
- [ ] Ensure no `prompt_text`, `messages`, or tool-argument fields

### Step 2: SQLite v2 migration and StorePort methods

- [ ] Bump schema to v2; add `dataset` table separate from `telemetry`
- [ ] Implement `appendDatasetRecord`, `listDatasetRecords`, retention trim on SQLite store
- [ ] Extend `StorePort` interface

### Step 3: MemoryStore mirror and tests

- [ ] Implement dataset methods on `MemoryStore`
- [ ] Add unit tests: append, list, retention trim, migration v2
- [ ] Assert schema has no prompt columns

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Dataset schema and StorePort methods land without extension or pipeline changes
- [ ] Privacy invariant: no prompt fields in type or DB schema
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-056): description`

## Do NOT

- Wire opt-in recorder (SP-058)
- Plumb triage/HyDRA to routing path (SP-057)
- Store prompt plaintext or message content

---

## Amendments (Added During Execution)
