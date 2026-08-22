## Summary

Migrate from ESLint 8.57.1 (EOL) to ESLint 9+ flat config while preserving `@typescript-eslint/no-explicit-any` as error.

## Priority

P3

## Pipeline stages

`.eslintrc.cjs`, `package.json`, CI lint job

## Problem / motivation

`eslint@8.57.1` deprecated; flat config is current. Repo has careful overrides for `src/domain`, `src/infrastructure` — migration must preserve behavior (Gemini retry P3).

## Proposed solution

- [ ] Add `eslint.config.js` flat config equivalent to `.eslintrc.cjs`.
- [ ] Include overrides for `src/cli`, `src/infra` if missing from no-any rule.
- [ ] Remove legacy `.eslintrc.cjs` after parity verified.
- [ ] `npm run lint` green in CI.
- [ ] Document migration in PR description (no standalone markdown file unless requested).

## Evidence

- `.eslintrc.cjs`
- Grok/Sonnet: ESLint 8 EOL

## Dependencies

None.

## Out of scope

- Type-aware ESLint (separate future issue)
- Fixing all pre-existing lint in `scripts/` compiled JS

## Verification

```bash
npm run lint
npm run typecheck
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| ESLint migration | Autonomous |
