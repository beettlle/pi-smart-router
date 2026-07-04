# Task: SP-046 — Registry Cost Mapper

**Created:** 2026-07-04
**Size:** S

## Review Level: 1

**Assessment:** Map pi registry Model.cost into ModelProfile pricing defaults.
**Score:** 2/8

## Mission

Extend `pi-model-mapper` so fleet profiles use cost data from pi's model registry when available, instead of pattern-only static defaults. Pass `Model.cost` from the extension's registry discovery into `mapPiModelToProfile` / `mapFleetFromRegistry`. Pattern-based tier and capability defaults remain; registry cost overrides `fallback_cost_per_1m` when pi provides non-zero input/output rates.

## Dependencies

- SP-045

## Context to Read First

- `src/config/pi-model-mapper.ts` — `PiModelInput`, `mapPiModelToProfile`, pattern defaults
- `.pi/extensions/smart-router/index.ts` — `registryModelsToFleetInput`, `discoverFleet`
- `@earendil-works/pi-ai` — `Model.cost` shape on registry models
- `tests/unit/pi-model-mapper.test.ts` — existing mapper tests
- `tests/integration/pi-extension.test.ts` — fleet mapping integration

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts`, `.pi/extensions/smart-router/index.ts`, `tests/unit/pi-model-mapper.test.ts` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts` |
| fileScopeMustNotChange | `src/domain/**` |
| completionCriteria | Registry models with cost fields produce ModelProfile pricing from pi data; models without cost keep pattern defaults; extension passes cost through discovery. |

## Steps

### Step 1: Mapper cost derivation

- [ ] Extend `PiModelInput` with optional cost fields matching pi registry `Model.cost` (input, output, cacheRead, cacheWrite)
- [ ] Derive `fallback_cost_per_1m` from registry cost when present (document formula in code comment — e.g. weighted blend of input/output per 1M tokens)
- [ ] Preserve pattern-based tier/capabilities; only pricing defaults yield to registry when cost is available
- [ ] Zero-cost local models remain free

### Step 2: Extension pass-through

- [ ] Update `registryModelsToFleetInput` to forward cost from `ModelRegistry.getAvailable()` models
- [ ] Verify scoped and all fleet modes both receive cost-enriched profiles

### Step 3: Testing and verification

- [ ] Add unit tests: registry cost overrides static default; missing cost uses pattern default; zero-cost local unchanged
- [ ] Update or extend `tests/integration/pi-extension.test.ts` if fleet mapping assertions need cost fields
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-046): description`

## Do NOT

- Modify domain layer (`src/domain/**`)
- Add LiteLLM fetch or price broker wiring (SP-045)
- Wire HyDRA matcher (SP-044)

---

## Amendments (Added During Execution)
