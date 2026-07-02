# Task: SP-019 — Local Probes

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Hardware probe and local service pings.
**Score:** 3/8

## Mission

Hardware probe and LM Studio/Ollama readiness pings. Maps to T044, T045.

## Dependencies

- SP-018

## Context to Read First

- `specs/001-build-smart-router/data-model.md`
- `specs/001-build-smart-router/spec.md (US5)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/infrastructure/hardware/hardware-probe.ts`
- `src/infrastructure/local/local-zero-tier.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/hardware/hardware-probe.ts`, `src/infrastructure/local/local-zero-tier.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Probe returns full_local, classification_only, or disabled; pings under 15ms combined. |

## Steps

### Step 1: Probes

- [ ] T044: hardware-probe.ts three-state gate
- [ ] T045: LM Studio + Ollama readiness pings

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-019): description`

## Do NOT

- Integrate pipeline Steps 1+4 (SP-020)

---

## Amendments (Added During Execution)
