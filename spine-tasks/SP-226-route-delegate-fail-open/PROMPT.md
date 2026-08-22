# Task: SP-226 — route-and-delegate fail-open

**Created:** 2026-08-22
**Size:** M

## Review Level: 1

**Assessment:** Extension must not throw when delegation fleet exhausted or stream fails unrecoverably.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#140
- Bucket: bug
- Closes: #140
- Release: v0.17.0
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## Mission

Closes #140 — Align `route-and-delegate.ts` with pipeline never-throw constitution. Replace throws at no registry model (~356–362) and unrecoverable stream errors (~579–588) with structured telemetry + safe fallback. Emit reason codes in explain / `SMART_ROUTER_LOG_ROUTING=1`. Tests: exhausted `failedModelIds` → no throw; host receives degraded response.

## Dependencies

- None

## Context to Read First

- `.pi/extensions/smart-router/route-and-delegate.ts` — throw sites ~356–362, ~579–588
- `tests/unit/smart-router-extension.test.ts`, `tests/unit/pre-delegation-abort.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/route-and-delegate.ts`, `tests/unit/smart-router-extension.test.ts` |
| May change | `tests/unit/pre-delegation-abort.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` routing policy |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts tests/unit/pre-delegation-abort.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | No throw on exhausted fleet or unrecoverable stream; reason codes emitted; tests prove fail-open; #140 closable |

## Steps

### Step 1: Replace throws with fail-open paths

- [ ] Safe fallback when no registry model resolves
- [ ] Degraded response on unrecoverable stream after failover exhaustion
- [ ] Structured telemetry / explain reason codes

### Step 2: Testing and verification

- [ ] Test exhausted `failedModelIds` → no throw
- [ ] Run Contract `testCommand`
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Extension never crashes pi host on exhaustion paths
- [ ] Reason codes visible when logging enabled
- [ ] #140 closable

## Do NOT

- Redesign full stream failover
- Touch planning delegate spawn (#71 closed)
