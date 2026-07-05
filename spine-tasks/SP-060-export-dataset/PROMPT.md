# Task: SP-060 — Export Dataset

**Created:** 2026-07-05
**Size:** M

## Review Level: 2

**Assessment:** Add /smart-router export dataset command writing privacy-safe JSONL for offline analysis.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#9
- Bucket: feature

## Mission

Manual export of opt-in routing dataset for offline analysis / future training.

Tasks:
- Add command: `/smart-router export dataset [--limit N]` to `commands.ts`
- Write JSONL to `.pi-smart-router/exports/dataset-<timestamp>.jsonl`
- Export Tier 1 fields only; strip or hash `session_id`
- No automatic upload — user-initiated only
- Tests for command parsing + export shape

## Dependencies

- SP-058

## Context to Read First

- `.pi/extensions/smart-router/commands.ts` — existing subcommands
- `.pi/extensions/smart-router/index.ts` — command handler wiring
- `src/domain/types/entities.ts` — `RoutingDatasetRecord`
- `src/domain/types/store-port.ts` — `listDatasetRecords`
- `src/infrastructure/persistence/sqlite-store.ts`
- `tests/integration/pi-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/commands.ts`, `.pi/extensions/smart-router/index.ts` |
| May change | `tests/integration/pi-extension.test.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/commands.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | /smart-router export dataset writes JSONL with Tier 1 fields only; session_id stripped/hashed; no prompt fields; user-initiated only; tests pass. |

## Steps

### Step 1: Command parsing and completions

- [ ] Extend `parseSmartRouterArgs` / completions for `export dataset [--limit N]`
- [ ] Update `SMART_ROUTER_USAGE` and `SMART_ROUTER_FULL_INVOCATIONS`

### Step 2: Export handler

- [ ] Read records via StorePort `listDatasetRecords`
- [ ] Write JSONL to `.pi-smart-router/exports/dataset-<timestamp>.jsonl`
- [ ] Strip or hash `session_id`; export Tier 1 fields only

### Step 3: Tests

- [ ] Command parsing tests
- [ ] Export shape tests: no prompt fields; correct JSONL format
- [ ] Empty dataset graceful message

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run build`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Export command works end-to-end
- [ ] Privacy invariant: no prompt text in export
- [ ] Tests and build pass

## Git Commit Convention

- `feat(SP-060): description`

## Do NOT

- Implement prompt fingerprint (SP-061)
- Implement outcome labels (SP-062)
- Auto-upload or sync dataset anywhere

---

## Amendments (Added During Execution)
