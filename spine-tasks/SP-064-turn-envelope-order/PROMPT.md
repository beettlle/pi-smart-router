# Task: SP-064 — Turn Envelope Order

**Created:** 2026-07-05
**Size:** M

## Review Level: 2

**Assessment:** Global reorder — run turn_envelope before session_pin so planning gets frontier bias and tool_result can downgrade even when pinned.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#23
- Bucket: bug

## Mission

Planning/architecture prompts are classified as `turn_type=planning` but still route to a pinned economical model because `session_pin` runs before `turn_envelope` in the pipeline. When an active pin exists, `session_pin` returns `session_pinned` and exits before `turn_envelope`, so `planning → frontier-cloud` never runs.

**Fix direction (operator-approved): global reorder** — move `turn_envelope` before `session_pin` for all turns. Do not implement planning-only conditional reorder, tier override, or defer-pin.

Current stage order in `src/domain/pipeline/router-pipeline.ts`:

```
hardware_probe → loop_escalation → session_pin → triage → turn_envelope → local_zero → triage → hydra_match
```

Target order:

```
hardware_probe → loop_escalation → turn_envelope → session_pin → triage → local_zero → triage → hydra_match
```

Preserve SP-050 triage/local-zero ordering (do not regress #15).

## Dependencies

- SP-059

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — `stages` array, `sessionPin`, `turnEnvelope`
- `tests/integration/session-pinning.test.ts` — pin vs envelope expectations
- `tests/unit/router-pipeline.test.ts`
- `tests/integration/full-pipeline.test.ts` — turn envelope section
- `docs/PRD.md` — Step 2b / Step 3 turn-type vs pin semantics

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `tests/integration/session-pinning.test.ts`, `tests/unit/router-pipeline.test.ts`, `tests/integration/full-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Planning turn with economical pin routes frontier via turn_envelope; tool_result can downgrade from frontier pin; SP-050 ordering preserved; pin/cache tests updated for global reorder. |

## Testing

- Integration: active economical pin → planning turn → `stage: turn_envelope`, `reason_code: turn_planning`, `tier: frontier-cloud`
- Integration: active frontier pin → tool_result turn → economical via `turn_envelope`
- Existing pin tests (compaction break, user override, tool_result sub-route) still pass with updated expectations
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Reorder stages

- [ ] Move `turn_envelope` before `session_pin` in the `stages` array
- [ ] Verify `sessionPin` still respects turn_envelope tier hints when pin applies after envelope
- [ ] Do not change SP-050 local_zero / triageCloudFallback ordering

### Step 2: Update tests

- [ ] Fix session-pinning tests that assumed pin wins before envelope
- [ ] Add planning-with-economical-pin integration test per issue #23 acceptance
- [ ] Add tool_result downgrade with frontier pin test

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Confirm telemetry stage/reason_code for planning case

## Completion Criteria

- [ ] Planning turn with active economical pin routes to frontier-cloud via turn_envelope
- [ ] Telemetry shows `stage: turn_envelope`, `reason_code: turn_planning` (or equivalent) for such turns
- [ ] Tool_result downgrade works when pinned to frontier
- [ ] Existing pin/cache tests pass with updated semantics
- [ ] SP-050 triage/local-zero ordering unchanged

## Git Commit Convention

- `fix(SP-064): description`

## Do NOT

- Implement planning-only conditional reorder
- Implement tier-override or defer-pin alternatives
- Regress SP-050 (#15) local-zero before triage cloud exit
- Change extension wiring in `.pi/extensions/smart-router/index.ts`

---

## Amendments (Added During Execution)
