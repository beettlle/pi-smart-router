## Summary

Replace 70+ deep `../../../src/` imports in the pi extension with a stable public facade exported from the package entrypoint.

## Priority

P1

## Pipeline stages

`.pi/extensions/smart-router/`, `src/index.ts`, lint/CI guards

## Problem / motivation

Extension imports internal modules from source (~70 occurrences per Gemini retry), bypassing public API boundaries. Refactoring `src/domain/**` breaks the extension silently. npm ships both `src/` and extension with two loaders.

## Proposed solution

- [ ] Define `createSmartRouterFacade()` (or expand `createRouter()`) exporting only stable types/functions extension needs.
- [ ] Migrate extension imports to facade in phased PRs (route-and-delegate, commands, setup first).
- [ ] Add ESLint `no-restricted-imports` or custom check blocking `../../../src/domain` from `.pi/extensions/**`.
- [ ] CI step fails on new deep imports.
- [ ] Document public vs internal API in README “Embedding” section (cross-link C4 parity doc).

## Evidence

- `.pi/extensions/smart-router/index.ts` — imports from `../../../src/**`
- `.pi/extensions/smart-router/route-and-delegate.ts` — deep imports
- Gemini retry: 70+ boundary violations

## Dependencies

| Issue | Role |
|-------|------|
| C4 | Documentation of parity gap |
| B1 | Facade may co-evolve with pipeline split |

## Out of scope

- Publishing extension as separate npm package
- Changing pi extension load mechanism

## Verification

```bash
npm run typecheck && npm test
npm run lint
# grep -r '../../../src/' .pi/extensions/smart-router/ | wc -l  → target 0
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Facade + migration | Autonomous |
