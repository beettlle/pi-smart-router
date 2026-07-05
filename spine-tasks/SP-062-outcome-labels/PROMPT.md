# Task: SP-062 — Outcome Labels

**Created:** 2026-07-05
**Size:** M

## Review Level: 2

**Assessment:** Behavioral outcome labels for router policy learning without storing prompt text.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#11
- Bucket: feature

## Mission

Behavioral outcome labels to improve router policy learning without storing prompt text.

Candidate signals:
- User `/model` override after auto-route
- Compaction-triggered pin break
- Optional `/smart-router feedback good|bad`
- Tool failure counts (already tracked in SessionPin)

Tasks:
- Design outcome schema keyed by `request_id`
- Append to dataset record or separate `outcomes` table
- Capture signals above when SMART_ROUTER_DATASET=1

## Dependencies

- SP-061

## Context to Read First

- `src/domain/types/entities.ts` — `RoutingDatasetRecord`, `SessionPin`
- `src/domain/pinning/session-pinner.ts`
- `src/infrastructure/persistence/sqlite-store.ts`
- `src/infrastructure/telemetry/dataset-recorder.ts`
- `.pi/extensions/smart-router/index.ts` — lifecycle hooks, command handler
- `.pi/extensions/smart-router/commands.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/entities.ts`, `src/infrastructure/persistence/sqlite-store.ts` |
| May change | `src/infrastructure/telemetry/dataset-recorder.ts`, `.pi/extensions/smart-router/index.ts`, `.pi/extensions/smart-router/commands.ts`, `tests/unit/dataset-recorder.test.ts`, `tests/integration/pi-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/types/entities.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Outcome schema keyed by request_id; model override, compaction pin break, and feedback good/bad captured; no prompt text; tests pass. |

## Testing

- Unit tests for outcome append and lookup
- Integration test: model override records outcome label
- Run `npm run typecheck && npm test` and `npm run build`

## Steps

### Step 1: Outcome schema design

- [ ] Define `RoutingOutcomeRecord` or extend dataset with outcome fields
- [ ] Key by `request_id`; link to dataset record
- [ ] SQLite migration if separate outcomes table

### Step 2: Capture model override signal

- [ ] Detect user `/model` override after auto-route in extension
- [ ] Append outcome label with signal type `model_override`

### Step 3: Capture compaction pin break and feedback command

- [ ] Record compaction-triggered pin break as outcome
- [ ] Add `/smart-router feedback good|bad` subcommand
- [ ] Wire feedback to most recent request_id for session

### Step 4: Tests and verification

- [ ] Unit tests for outcome append and lookup
- [ ] Integration test: override → outcome recorded
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run build`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Outcome labels captured for key signals
- [ ] No prompt text in outcome records
- [ ] Tests and build pass

## Git Commit Convention

- `feat(SP-062): description`

## Do NOT

- Store prompt plaintext
- Change export privacy rules (SP-060)
- Revert fingerprint wiring (SP-061)

---

## Amendments (Added During Execution)

- **2026-07-05:** SP-061 may preland fingerprint in dataset-recorder. Outcome capture must not revert SP-061.
