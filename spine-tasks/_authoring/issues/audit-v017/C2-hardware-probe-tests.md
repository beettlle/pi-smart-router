## Summary

Add unit tests for Linux/Windows/macOS `SystemInfoPort` paths in hardware probe — complements real-hardware dogfood (#25/#26).

## Priority

P2

## Pipeline stages

`src/infrastructure/hardware/hardware-probe.ts`, platform SystemInfoPort implementations

## Problem / motivation

`hardware-probe.ts` ~46% line coverage; OS-specific paths (`readLinuxPowerInfo`, `readWindowsPowerInfo`, `pmset`) have zero dedicated tests. Fixture-only CI does not catch platform policy regressions (Sonnet audit).

## Proposed solution

- [ ] Inject mock `SystemInfoPort` fixtures for Linux `/sys/class/power_supply`, Windows WMI/PowerShell results, macOS battery states.
- [ ] Test three-state contract: `full_local`, `classification_only`, `disabled`.
- [ ] Raise line coverage on `hardware-probe.ts` to ≥80% without real hardware.
- [ ] Document relationship to #25/#26 (dogfood validates real hosts; this issue validates logic).

## Evidence

- `src/infrastructure/hardware/hardware-probe.ts`
- Sonnet: 45.87% coverage; SP-019 review cited gaps

## Dependencies

| Issue | Role |
|-------|------|
| #25, #26 | Real hardware dogfood — complementary |
| #1 | Epic parent |

## Out of scope

- Promoting Linux/Windows from experimental (dogfood issues)
- CI runners on every OS

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/hardware-probe.test.ts
npm run coverage:check  # hardware-probe.ts threshold met
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Unit tests | Autonomous |
