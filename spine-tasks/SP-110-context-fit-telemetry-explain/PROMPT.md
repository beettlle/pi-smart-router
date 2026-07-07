# Task: SP-110 — Context-fit telemetry and explain endpoint

**Created:** 2026-07-07
**Size:** S

## Review Level: 1

**Assessment:** #53 — emit context-fit metadata in telemetry, dataset export, explain endpoint, and routing logs.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#53
- Bucket: feature
- Epic: beettlle/pi-smart-router#46

## Mission

Add observability for context-fit routing decisions. Extend telemetry/dataset records with `context_fit_viable_count`, `context_fit_rejected_json`, `context_overflow_pin_break`, and `selected_model_max_input_tokens`. Add reason codes (`context_fit_pass`, `context_fit_rejected_all`, `context_overflow_pin_break`, overflow fallback variants). Wire into `pi router explain`, `POST /v1/route/explain`, and `SMART_ROUTER_LOG_ROUTING=1` JSON logs.

## Dependencies

- SP-093
- SP-095

## Context to Read First

- `src/infrastructure/telemetry/routing-telemetry.ts`
- `src/infrastructure/telemetry/dataset-recorder.ts`
- `src/api/explain/router-explain.ts`
- `src/domain/types/entities.ts`
- `specs/001-build-smart-router/contracts/explain-endpoint.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/telemetry/routing-telemetry.ts` |
| May change | `src/infrastructure/telemetry/dataset-recorder.ts`, `src/api/explain/router-explain.ts`, `src/domain/types/entities.ts`, `tests/unit/routing-telemetry.test.ts`, `tests/unit/router-explain.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/infrastructure/telemetry/routing-telemetry.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Telemetry rows include context-fit metadata; explain documents rejected models and overflow pin break; dataset export includes new privacy-safe fields; unit tests for emitter and explain serializer. |

## Steps

### Step 1: Telemetry and dataset fields

- [ ] Extend routing telemetry payload with context-fit fields from issue spec
- [ ] Ensure `estimated_input_tokens` populated when gate runs
- [ ] Add context-fit reason codes to decision records

### Step 2: Explain and logging

- [ ] Extend explain serializer with token estimate, per-candidate fit results, pin-break flag
- [ ] Include context-fit summary in `SMART_ROUTER_LOG_ROUTING=1` JSON log line
- [ ] Update explain contract doc if response shape changes

### Step 3: Testing and verification

- [ ] Unit tests for telemetry emitter and explain serializer
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Telemetry rows include context-fit metadata on decisions that use the gate
- [ ] Explain endpoint documents rejected models and overflow break
- [ ] Dataset export includes new fields (privacy-safe — no message content)
- [ ] Unit tests for telemetry emitter and explain serializer
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-110): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
