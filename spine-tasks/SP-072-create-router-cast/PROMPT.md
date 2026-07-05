# Task: SP-072 — Create Router Cast Removal

**Created:** 2026-07-05
**Size:** S

## Review Level: 1

**Assessment:** Remove unsafe double-cast at `createRouter()` public API boundary.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#34
- Bucket: bug

## Mission

The public factory `createRouter()` bypasses TypeScript strictness with a double cast:

```ts
return createRouterFromFleet(catalog.models as unknown as ModelProfile[]);
```

`loadModels()` already returns a Zod-validated `FleetCatalog`. Remove the cast by aligning `FleetCatalog.models` with `ModelProfile` (e.g. `z.infer<typeof ModelProfileSchema>`) or adding an explicit typed mapper in `models-loader.ts`. Optional: add `createRouterFromCatalog(catalog: FleetCatalog)` if cleaner API.

## Dependencies

- SP-070

## Context to Read First

- `src/index.ts` — line ~46
- `src/infrastructure/models/models-loader.ts`
- `src/domain/schemas/` — ModelProfileSchema, FleetCatalog schema
- `tests/unit/models-loader.test.ts` if present

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/index.ts` |
| May change | `src/infrastructure/models/models-loader.ts`, `src/domain/schemas/**` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | No `as unknown as ModelProfile[]` at public boundary; typecheck passes with aligned FleetCatalog.models type. |

## Steps

### Step 1: Align types

- [ ] Align `FleetCatalog.models` with `ModelProfile` via schema inference or typed mapper
- [ ] Remove double cast in `createRouter()`

### Step 2: Optional API cleanup

- [ ] Add `createRouterFromCatalog(catalog: FleetCatalog)` if it simplifies the public API

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Confirm no new casts at public API boundary

## Completion Criteria

- [ ] `as unknown as ModelProfile[]` removed from `createRouter()`
- [ ] Typecheck passes without escape casts at public boundary
- [ ] Existing tests green

## Git Commit Convention

- `fix(SP-072): description`

## Do NOT

- Introduce new `any` or double casts elsewhere
- Change routing pipeline behavior

---

## Amendments (Added During Execution)
