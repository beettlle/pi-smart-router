# Task: SP-140 — Consumer-safe resolveModelScope resolution

**Created:** 2026-07-09
**Size:** M

## Review Level: 1

**Assessment:** #86 part 1 — fix pi-model-scope so extension loads after `pi install npm:pi-smart-router` without dev repo node_modules.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#86
- Release: v0.4.0 Delegate
- Bucket: bug

## Mission

Fix `.pi/extensions/smart-router/pi-model-scope.ts` so `resolveModelScope` loads in a real consumer install. Today `findPiCodingAgentDir()` walks only from the extension directory and `process.cwd()`, missing pi's global install and `~/.pi/agent/npm` layouts. Prefer a public `@earendil-works/pi-coding-agent` import when available; otherwise resolve pi-coding-agent from pi's install tree, agent npm root, and `createRequire`/`import.meta.resolve` before failing.

## Dependencies

- SP-087 (shared ModelRegistry landed — pi-model-scope shim exists)

## Context to Read First

- `.pi/extensions/smart-router/pi-model-scope.ts`
- `spine-tasks/SP-087-shared-model-registry/PROMPT.md`
- `package.json` — peer/optional deps for pi-coding-agent
- Issue #86 reproduction steps and root-cause analysis

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/pi-model-scope.ts` |
| May change | `tests/unit/pi-model-scope.test.ts`, `package.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `.pi/extensions/smart-router/pi-model-scope.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Extension resolves pi-coding-agent from consumer/global paths; unit tests cover temp-dir import without repo dev node_modules; no regression in dev-repo dogfood path. |

## Steps

### Step 1: Resolution strategy

- [ ] Attempt direct import from `@earendil-works/pi-coding-agent` public surface when `resolveModelScope` is exported
- [ ] Add fallback candidates: pi global install, `~/.pi/agent/npm/node_modules`, `require.resolve` / `import.meta.resolve`
- [ ] Keep clear error message with install hint when all candidates fail

### Step 2: Unit tests

- [ ] Add `tests/unit/pi-model-scope.test.ts` with fixture layout simulating consumer install (no repo root node_modules)
- [ ] Cover dev-repo path still works

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `pi-model-scope.ts` resolves in consumer layout per #86
- [ ] Unit tests cover consumer and dev paths
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `fix(SP-140): description`

## Do NOT

- Extend verify-consumer-pack.sh (SP-141)
- Change extension index wiring beyond scope import (SP-144)

---
