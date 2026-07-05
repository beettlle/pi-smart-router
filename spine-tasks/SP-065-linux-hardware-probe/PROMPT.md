# Task: SP-065 — Linux Hardware Probe

**Created:** 2026-07-05
**Size:** M

## Review Level: 1

**Assessment:** Extract SystemInfoPort implementations; add Linux provider and fixture matrix; replace darwin-only guard with platform-aware policy.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#1
- Bucket: feature

## Mission

Hardware probe currently gates local routing to macOS Apple Silicon only (`platform === 'darwin' && arch === 'arm64'`). Extend for Linux with cross-platform refactor:

- Extract platform-specific `SystemInfoPort` implementations (macOS, Linux) behind existing port in `hardware-probe.ts`
- Linux provider: memory from `os`, power from `/sys/class/power_supply` (or documented desktop fallback when no battery)
- Replace hard darwin/arm64 guard in `probeHardware()` with platform-aware policy (Linux x64/arm64 eligible via same memory/battery thresholds)
- Extend `tests/unit/hardware-probe.test.ts` with Linux fixture matrix
- Mark Linux support **experimental** in README (no real hardware validation required)

## Dependencies

- SP-064

## Context to Read First

- `src/infrastructure/hardware/hardware-probe.ts` — `probeHardware`, `getDefaultSystemInfo`, `SystemInfoPort`
- `tests/unit/hardware-probe.test.ts`
- `src/domain/pipeline/router-pipeline.ts` — `hardwareProbeStage`, `localZeroTierStage`
- `README.md` — Prerequisites section

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
| completionCriteria | Linux x64/arm64 probe logic via fixtures; macOS behavior unchanged; README notes experimental Linux support. |

## Testing

- Unit matrix: Linux desktop (AC, sufficient RAM) → full_local or classification_only
- Unit matrix: Linux laptop on battery below threshold → disabled
- macOS existing cases still pass
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Refactor SystemInfoPort

- [ ] Extract macOS provider from `getDefaultSystemInfo`
- [ ] Add Linux `SystemInfoPort` with `/sys/class/power_supply` or safe fallback
- [ ] Wire default provider selection by `os.platform()`

### Step 2: Platform-aware probeHardware

- [ ] Replace darwin-only guard with policy supporting darwin/arm64 and linux x64/arm64
- [ ] Keep `probeHardware()` pure; providers supply `SystemInfo`

### Step 3: Tests and README

- [ ] Add Linux fixture matrix to `hardware-probe.test.ts`
- [ ] Update README prerequisites with experimental Linux note
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] Non-macOS Linux no longer hard-disabled without tested policy
- [ ] CI covers Linux probe via injected fixtures
- [ ] macOS Apple Silicon behavior unchanged
- [ ] README documents experimental Linux support

## Git Commit Convention

- `feat(SP-065): description`

## Do NOT

- Add Windows provider (SP-066)
- Require real Linux hardware or CI runners
- Change pipeline stage logic

---

## Amendments (Added During Execution)
