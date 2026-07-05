# Task: SP-066 — Windows Hardware Probe

**Created:** 2026-07-05
**Size:** M

## Review Level: 1

**Assessment:** Add Windows SystemInfoPort; extend probe policy and fixture matrix; document experimental Windows support.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#1
- Bucket: feature

## Mission

Build on SP-065 cross-platform refactor to add Windows hardware probe support:

- Windows `SystemInfoPort` (memory from `os`, power status via platform-appropriate Node approach or documented fallback)
- Extend `probeHardware()` policy for `win32` x64 (and arm64 if applicable)
- Same three-state contract: `full_local`, `classification_only`, `disabled`
- Fixture tests for Windows matrix in `hardware-probe.test.ts`
- README experimental Windows note

No real Windows hardware validation required; fixture-driven CI only.

## Dependencies

- SP-065

## Context to Read First

- `src/infrastructure/hardware/hardware-probe.ts` — SP-065 port refactor
- `tests/unit/hardware-probe.test.ts`
- `README.md` — Prerequisites (updated in SP-065 for Linux)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/hardware/hardware-probe.ts` |
| May change | `tests/unit/hardware-probe.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/hardware/hardware-probe.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Windows probe logic via fixtures; macOS/Linux behavior unchanged; README notes experimental Windows support. |

## Testing

- Unit matrix: Windows desktop (AC, sufficient RAM) → full_local or classification_only
- Unit matrix: Windows on battery below threshold → disabled
- macOS and Linux cases from SP-065 still pass
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Windows SystemInfoPort

- [ ] Implement Windows provider for memory and power status
- [ ] Wire into default provider selection alongside macOS/Linux

### Step 2: Extend probeHardware policy

- [ ] Add win32 to supported platform policy
- [ ] Keep pure function; shared threshold logic

### Step 3: Tests and README

- [ ] Add Windows fixture matrix
- [ ] Update README with experimental Windows note
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] Windows no longer hard-disabled without tested policy
- [ ] CI covers Windows probe via injected fixtures
- [ ] macOS and Linux behavior unchanged
- [ ] README documents experimental Windows support

## Git Commit Convention

- `feat(SP-066): description`

## Do NOT

- Require real Windows hardware or CI runners
- Change pipeline stage logic
- Remove experimental labeling until dogfooded

---

## Amendments (Added During Execution)
