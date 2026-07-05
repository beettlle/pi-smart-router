# Task: SP-058 — Dataset Recorder

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Gate privacy-safe dataset writes behind SMART_ROUTER_DATASET=1 with retention limits and user notification.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#8
- Bucket: feature

## Mission

Gate privacy-safe dataset writes behind an explicit opt-in. Default remains off.

Tasks:
- Env gate: `SMART_ROUTER_DATASET=1`
- Wire recorder in `createDispatchOptions` / routing path alongside existing telemetry
- Retention caps (e.g. 30 days / 10k rows) — reuse or extend `telemetry-limits.ts` pattern
- One-time `ctx.ui.notify` when enabled explaining what is / isn't stored
- Tests asserting no prompt text in DB
- Update README: flip `SMART_ROUTER_DATASET` from "future" to documented opt-in

## Dependencies

- SP-057

## Context to Read First

- `.pi/extensions/smart-router/index.ts` — dispatch and telemetry wiring
- `src/infrastructure/telemetry/routing-telemetry.ts`
- `src/infrastructure/telemetry/telemetry-limits.ts`
- `src/domain/types/entities.ts` — `RoutingDatasetRecord`
- `src/domain/types/store-port.ts`
- `README.md` — env var table (~line 243)
- `tests/integration/pi-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts` |
| May change | `src/infrastructure/telemetry/dataset-recorder.ts`, `src/infrastructure/telemetry/dataset-limits.ts`, `README.md`, `tests/integration/pi-extension.test.ts`, `tests/unit/dataset-recorder.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | SMART_ROUTER_DATASET=1 enables dataset writes with triage/HyDRA fields; default off; retention caps enforced; UI notify on enable; tests assert no prompt columns in DB; README updated. |

## Steps

### Step 1: Dataset recorder module

- [ ] Create recorder that maps routing decision + feature sidecar → `RoutingDatasetRecord`
- [ ] Gate on `process.env.SMART_ROUTER_DATASET === '1'`
- [ ] Never include prompt_text, messages, or tool arguments

### Step 2: Wire extension routing path

- [ ] Call recorder after dispatch alongside existing telemetry emitter
- [ ] Use extension StorePort for `appendDatasetRecord`
- [ ] One-time UI notify when dataset mode first activates

### Step 3: Retention limits

- [ ] Add dataset retention constants (30d / 10k rows per #8)
- [ ] Trim on append using same pattern as telemetry-limits

### Step 4: Tests and README

- [ ] Integration test: SMART_ROUTER_DATASET=1 → rows in dataset table with feature fields
- [ ] Assert no prompt columns populated; default off writes nothing
- [ ] Update README env var table

### Step 5: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run build`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Opt-in dataset recording works end-to-end
- [ ] Privacy invariant enforced in tests
- [ ] README documents SMART_ROUTER_DATASET
- [ ] Tests and build pass

## Git Commit Convention

- `feat(SP-058): description`

## Do NOT

- Implement export command (SP-059 / #9)
- Store prompt plaintext or message content
- Change pipeline stage logic (SP-057)

---

## Amendments (Added During Execution)

- **2026-07-04:** SP-057 may preland feature sidecar on routing path. Recorder must consume sidecar without reverting SP-057 plumbing.
