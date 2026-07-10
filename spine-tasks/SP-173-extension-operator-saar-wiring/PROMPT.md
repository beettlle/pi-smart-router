# Task: SP-173 — Extension Operator SAAR Wiring

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Wire resolveOperatorConfigFromEnv into SessionPinner and createDispatchOptions so documented SAAR / planning-delegate env knobs affect live dogfood.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#92
- Bucket: bug
- Closes: #92

## Mission

Domain SAAR / planning-delegate / pin-only / operator-config support already exists, but the live pi extension never loads it. `createSmartRouterRuntime` builds `new SessionPinner({ store })` with no `saarConfig`, and `createDispatchOptions` omits `saarConfig`, `planningDelegateConfig`, `pinOnlyFallback`, `priceCatalog`, and `quotaWindowPosition`. Wire `resolveOperatorConfigFromEnv()` (plus optional `operator-config.json` if already supported) so documented `SMART_ROUTER_*` env knobs affect `/model smart-router/auto` sessions. Honor `pin_only_fallback` when set (emergency only; default remains false).

## Dependencies

- **None**

## Context to Read First

- `.pi/extensions/smart-router/extension-setup.ts` — SessionPinner construction
- `.pi/extensions/smart-router/fleet-bootstrap.ts` — `createDispatchOptions`
- `src/config/defaults.ts` — `resolveOperatorConfigFromEnv`, `DEFAULT_OPERATOR_CONFIG`
- `src/domain/pinning/session-pinner.ts` — `SessionPinnerConfig` (`saarConfig`, `pinOnlyFallback`)
- `src/domain/pipeline/router-pipeline.ts` — `RouterPipelineOptions` SAAR / planning fields
- `tests/integration/pi-extension.test.ts`, `tests/unit/smart-router-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/extension-setup.ts`, `.pi/extensions/smart-router/fleet-bootstrap.ts` |
| May change | `.pi/extensions/smart-router/types.ts`, `tests/integration/pi-extension.test.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/session-pinner.ts`, `README.md` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts tests/integration/pi-extension.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/extension-setup.ts`, `.pi/extensions/smart-router/fleet-bootstrap.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `README.md` |
| completionCriteria | Extension loads operator config into SessionPinner and dispatch options; SAAR/planning env knobs affect live path; pin_only_fallback honored when set; integration/unit tests assert wiring. |

## Steps

### Step 1: Load operator config into runtime

- [ ] Resolve operator config via `resolveOperatorConfigFromEnv` (and optional operator-config.json if a loader already exists)
- [ ] Construct `SessionPinner` with `saarConfig` and `pinOnlyFallback` from resolved config
- [ ] Pass `saarConfig`, `planningDelegateConfig`, `pinOnlyFallback`, and available catalog/quota fields through `createDispatchOptions` into `createRouterFromFleet`

### Step 2: Tests for live wiring

- [ ] Unit/integration test: `createDispatchOptions` / pinner receive SAAR + planning delegate from env/config
- [ ] Assert `pin_only_fallback` true when configured; default remains false
- [ ] Prefer existing pi-extension / smart-router-extension test harnesses

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts tests/integration/pi-extension.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Extension loads operator config into SessionPinner and gateway dispatch options
- [ ] Documented SAAR / planning-delegate env vars affect live `/model smart-router/auto` path (test-proven)
- [ ] `pin_only_fallback` honored when set; default false
- [ ] Integration/unit coverage for wiring

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Check If Affected | (none — leave README claims to follow-up if needed; avoid parallel README edits) |

## Git Commit Convention

- `fix(SP-173): description`

## Do NOT

- Reimplement SAAR or planning-delegate domain logic
- Change `router-pipeline.ts` or `session-pinner.ts` APIs unless a tiny type export is required (prefer not)
- Touch P(success) weights (#93) or benchmark profiles (#94)
- Flip `pin_only_fallback` default to true

---

## Amendments (Added During Execution)
