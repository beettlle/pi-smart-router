# Task: SP-098 — Fleet model id default mapping and cost telemetry

**Created:** 2026-07-06
**Size:** S

## Review Level: 1

**Assessment:** P2 for #70 — investigate opaque fleet id `default` (75 economical tool_result turns) and ensure turn_envelope does not pick unknown ids without explicit mapping.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#70
- Bucket: bug

## Mission

Telemetry shows fleet model id `default` used for 75 economical `tool_result` turns with unknown tier. Map explicitly in pi-model-mapper or exclude from turn_envelope lowest-cost selection. Ensure Cursor and unknown models report non-zero virtual cost in telemetry when applicable (extends SP-096).

## Dependencies

- SP-096

## Context to Read First

- `src/config/pi-model-mapper.ts`
- `src/domain/pipeline/router-pipeline.ts` — `turnEnvelope`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- `tests/unit/pi-model-mapper.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts` |
| May change | `src/domain/pipeline/router-pipeline.ts`, `tests/unit/pi-model-mapper.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `src/infrastructure/gateway/gateway-dispatch.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts` |
| fileScopeMustNotChange | `src/infrastructure/gateway/gateway-dispatch.ts` |
| completionCriteria | default fleet id explicitly mapped or excluded from blind turn_envelope selection; README operator note on excluding composer-latest when quota-sensitive. |

## Steps

### Step 1: Map or exclude default fleet id

- [ ] Add explicit mapper rule for id `default` (document source: Cursor/pi fleet) OR exclude from turn_envelope `.find`/lowest-cost pick
- [ ] Unit test for default id tier mapping

### Step 2: Testing and verification

- [ ] README: Cursor quota vs API cost distinction; exclude composer-latest from scoped fleet when quota-sensitive
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `default` fleet id no longer routes as unknown economical without explicit mapping
- [ ] README documents quota-sensitive fleet hygiene
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-098): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
