## Summary

Remove tracked compiled duplicates under `scripts/src/` or add CI drift detection against live `src/` and `dist/`.

## Priority

P2

## Pipeline stages

`scripts/src/**`, `scripts/calibration-aggregate.js`

## Problem / motivation

Git tracks `scripts/calibration-aggregate.js` + full `scripts/src/domain/**` compiled trees duplicating `src/`. Can diverge silently after refactors (Sonnet audit P1).

## Proposed solution

- [ ] **Preferred:** Delete tracked `scripts/src/**` and compiled `.js/.map` next to `.ts` sources; rely on `tsx` / `--experimental-strip-types`.
- [ ] **Alternative:** Add CI script comparing hashes or forbidding `scripts/src` changes without matching `src/` commit.
- [ ] Update `.gitignore` if needed.
- [ ] Verify all `npm run routing:*` scripts still work.

## Evidence

- `scripts/src/**` — ~40 JS/d.ts/map files
- `scripts/calibration-aggregate.js` beside `.ts` source

## Dependencies

None.

## Out of scope

- `dist/` build output (already gitignored)

## Verification

```bash
npm run typecheck
npm run routing:calibration-aggregate -- --help  # or smoke dry-run
git status  # no scripts/src tracked after delete
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Delete or CI guard | Autonomous |
