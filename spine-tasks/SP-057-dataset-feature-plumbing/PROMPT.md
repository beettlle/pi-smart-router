# Task: SP-057 — Dataset Feature Plumbing

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Plumb triage verdict and HyDRA requirement vectors into routing decisions for dataset capture.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#7
- Bucket: feature

## Mission

Triage and HyDRA signals are computed during routing but discarded before persistence. Plumb them into a sidecar on the routing path so the dataset recorder (SP-058) can store privacy-safe features.

Tasks:
- Extend `RoutingDecision` or add `RoutingContext` sidecar with: triage verdict/reason/cyclomatic score, HyDRA `RequirementVector`, `candidates[]`
- Ensure pi extension path (`.pi/extensions/smart-router/index.ts`) receives these after `dispatch`
- **No prompt text** in any persisted output

## Dependencies

- SP-056

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — triage and hydra_match stages
- `src/domain/triage/triage-engine.ts` — `TriageResult`
- `src/domain/matching/hydra-matcher.ts` — `RequirementVector`, `MatchResult`
- `src/domain/types/entities.ts` — `RoutingDecision`, `RoutingDatasetRecord`
- `.pi/extensions/smart-router/index.ts` — dispatch path after SP-054/055

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/types/entities.ts` |
| May change | `.pi/extensions/smart-router/index.ts`, `tests/unit/router-pipeline.test.ts`, `tests/integration/pi-extension.test.ts` |
| Must NOT change | `src/infrastructure/persistence/sqlite-store.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `src/infrastructure/persistence/sqlite-store.ts` |
| completionCriteria | RoutingDecision or sidecar carries triage summary and HyDRA requirement vector; extension dispatch receives feature sidecar; no prompt text in any output field. |

## Steps

### Step 1: Extend routing types with feature sidecar

- [ ] Add triage fields (verdict, reason_code, cyclomatic_score) and HyDRA requirement vector to decision or companion type
- [ ] Preserve existing RoutingDecision API compatibility

### Step 2: Capture features in pipeline stages

- [ ] Retain triage result from triage stage through route completion
- [ ] Retain HyDRA requirements and candidates from hydra_match stage
- [ ] Attach to final decision returned by `RouterPipeline.route()`

### Step 3: Extension receives sidecar after dispatch

- [ ] Ensure `createDispatchOptions` / routing path in extension can read feature sidecar
- [ ] Do not persist yet (recorder is SP-058)

### Step 4: Testing and verification

- [ ] Unit test: pipeline returns triage + HyDRA fields on decision
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Feature sidecar available on routing path for dataset recorder
- [ ] No prompt text in sidecar fields
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-057): description`

## Do NOT

- Implement opt-in recorder or StorePort writes (SP-058)
- Change SQLite schema (SP-056)
- Log or persist prompt_text

---

## Amendments (Added During Execution)
