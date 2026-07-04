# Task: SP-040 — Extension Scaffold

**Created:** 2026-07-03
**Size:** M

## Review Level: 2

**Assessment:** Pi extension entry point with provider registration.
**Score:** 5/8

## Mission

Create `.pi/extensions/smart-router/index.ts` — the project-local pi extension. Async factory that discovers authenticated models via `ctx.modelRegistry.getAvailable()`, maps them to `ModelProfile` via `piModelMapper`, builds a pipeline via `createRouterFromFleet()`, and registers `smart-router` as a provider with a single `auto` model using `pi.registerProvider()`. Hook `context`, `session_compact`, `model_select` for state tracking.

The `streamSimple` function is a placeholder in this task — it delegates to safe cloud default. Real stream delegation is wired in SP-041.

## Dependencies

- SP-039

## Context to Read First

- Pi extension docs: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- Pi custom provider example: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/custom-provider-anthropic/index.ts`
- `src/api/middleware/pi-router-middleware.ts` — existing hook pattern for context/session_compact/model_select
- `src/index.ts` — `createRouterFromFleet()`
- `src/config/pi-model-mapper.ts` — `mapFleetFromRegistry()`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts`, `.pi/extensions/smart-router/package.json` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/**` |

## Steps

### Step 1: Extension package.json

- [ ] Create `.pi/extensions/smart-router/package.json` with deps on `@earendil-works/pi-ai` and local `pi-smart-router`

### Step 2: Extension entry point

- [ ] Create `.pi/extensions/smart-router/index.ts`
- [ ] Export default async factory `(pi: ExtensionAPI) => { ... }`
- [ ] In factory: `ctx.modelRegistry.getAvailable()` → `mapFleetFromRegistry()` → `createRouterFromFleet()`
- [ ] Register `smart-router` provider with `pi.registerProvider()`: single `auto` model
- [ ] Hook `context`, `session_compact`, `model_select` per existing middleware pattern
- [ ] Placeholder `streamSimple`: return safe cloud default text

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Verify extension loads without errors in dry run

---

## Amendments (Added During Execution)
