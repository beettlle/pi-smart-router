## Summary

Resolve Node `EBADENGINE` warnings: align `package.json` engines, CI Node version, and `@earendil-works/pi-*` peer requirements.

## Priority

P2

## Pipeline stages

`package.json`, `.github/workflows/ci.yml`, devDependencies

## Problem / motivation

`npm ci` emits `EBADENGINE`: `@earendil-works/pi-coding-agent@0.80.10` requires Node `>=22.19.0` while repo declares `>=22` and CI/dev may use 22.14.x (Gemini retry).

## Proposed solution

- [ ] Bump `engines.node` to `>=22.19.0` (or document exact LTS) matching pi peer floor.
- [ ] Update CI workflow Node version to declared minimum.
- [ ] Add `engine-strict` note in README prerequisites.
- [ ] Verify `minPiVersion` in extension manifest aligns with pinned pi deps.
- [ ] `npm ci` clean without EBADENGINE on supported Node.

## Evidence

- `package.json` — `engines`, `@earendil-works/pi-coding-agent@^0.80.10`
- Gemini retry P1/P2 engine mismatch

## Dependencies

None.

## Out of scope

- Upgrading pi to unreleased versions
- Supporting Node 20 (dropped)

## Verification

```bash
node -v  # >=22.19.0
npm ci 2>&1 | grep -i EBADENGINE  # expect none
npm run verify:ci
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| engines + CI bump | Autonomous |
