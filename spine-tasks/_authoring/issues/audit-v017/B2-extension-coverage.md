## Summary

Include `.pi/extensions/smart-router/**` in Vitest coverage thresholds — the primary runtime path is currently unmeasured.

## Priority

P1

## Pipeline stages

`vitest.config.ts`, `.pi/extensions/smart-router/`

## Problem / motivation

Coverage gate applies only to `src/**/*.ts` (50% thresholds; actual ~93%). Extension (~3k+ lines) owns routing, delegation, failover, and commands but is excluded. Coverage gate is theater for product behavior.

## Proposed solution

- [ ] Add `.pi/extensions/smart-router/**/*.ts` to vitest `coverage.include`.
- [ ] Set initial threshold ≥80% lines (ratchet +5% per release until aligned with src).
- [ ] Enforce in `npm run coverage:check` and CI.
- [ ] Document extension coverage in README testing section.

## Evidence

- `vitest.config.ts` — `include: ['src/**/*.ts']`
- Sonnet/Grok audit P1/P2

## Dependencies

| Issue | Role |
|-------|------|
| A1 | CI must run coverage check on extension changes |

## Out of scope

- Splitting `smart-router-extension.test.ts` (see C6)

## Verification

```bash
npm run coverage:check
# Report shows extension paths with enforced thresholds
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Config + threshold ratchet | Autonomous |
