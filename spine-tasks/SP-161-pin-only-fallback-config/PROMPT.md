# Task: SP-161 — pin_only_fallback config and session_pin wiring

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** #83 part 1 — operator config to degrade to pin-on-first-turn emergency mode.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#83
- Release: v0.6.0
- Bucket: feature

## Mission

Add operator config flag `pin_only_fallback` (emergency mode). When enabled, degrade to pin-on-first-turn routing — skip multi-stage routing after initial pin. Wire into session pinner and router pipeline. Document as emergency mode, not default.

## Dependencies

- SP-152 (eval harness — landed, for future automated trigger in SP-162)

## Context to Read First

- `src/domain/pinning/session-pinner.ts`
- `src/domain/pipeline/router-pipeline.ts`
- `src/domain/types/schemas.ts`
- `docs/routing-roadmap.md` §1, §10
- GitHub #83 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/schemas.ts`, `src/domain/pinning/session-pinner.ts`, `src/domain/pipeline/router-pipeline.ts` |
| May change | `config/operator-config.json.example`, `tests/unit/session-pinner.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `src/domain/matching/hydra-matcher.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/types/schemas.ts`, `src/domain/pinning/session-pinner.ts`, `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `src/domain/matching/hydra-matcher.ts` |
| completionCriteria | Config toggles pin-only behavior; integration test; emergency mode documented; not default. |

## Steps

### Step 1: Config schema

- [ ] Add `pin_only_fallback: boolean` to operator config (default `false`)
- [ ] Document emergency-only posture in config example

### Step 2: Session pin and pipeline wiring

- [ ] When `pin_only_fallback` enabled, pin on first turn and short-circuit later stages
- [ ] Integrate with session pinner `use_pin` path
- [ ] Preserve normal multi-stage routing when flag off

### Step 3: Testing and verification

- [ ] Integration test: config on → pin-only behavior; config off → normal routing
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `pin_only_fallback` config toggles behavior
- [ ] Integration test for pin-only mode
- [ ] Documented as emergency mode, not default
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-161): description`

## Do NOT

- Make pin-only the default policy

---
