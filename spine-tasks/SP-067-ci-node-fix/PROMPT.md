# Task: SP-067 — CI Node Fix

**Created:** 2026-07-05
**Size:** S

## Review Level: 1

**Assessment:** Fix GitHub Actions CI undici crash by pinning Node 22 instead of deprecated Node 20.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#24
- Bucket: bug

## Mission

GitHub Actions CI fails at the Test step with an unhandled rejection when Vitest loads tests that import `@earendil-works/pi-coding-agent`:

```
TypeError: webidl.util.markAsUncloneable is not a function
  at new CacheStorage …/pi-coding-agent/node_modules/undici/lib/web/cache/cachestorage.js:20:17
```

The workflow requests Node 20; GitHub runners force Node 24, which breaks nested `undici@8.5.0` inside pi-coding-agent. Four test files error during module init.

Fix:
- Update `.github/workflows/ci.yml` `node-version` from `20` to **`22`** (LTS, avoids forced Node 24 upgrade)
- Align `package.json` `engines.node` to `>=22` (spine doctor already requires Node >= 22)

## Dependencies

- SP-066

## Context to Read First

- `.github/workflows/ci.yml` — current node-version
- `package.json` — engines field
- Failing run: https://github.com/beettlle/pi-smart-router/actions/runs/28749716700/job/85246590255

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/ci.yml`, `package.json` |
| Must NOT change | `src/**`, `tests/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.github/workflows/ci.yml` |
| fileScopeMustNotChange | `src/**` |
| completionCriteria | CI verify job passes on push to main; local typecheck and test green. |

## Steps

### Step 1: Bump CI Node version

- [ ] Change `node-version` in `.github/workflows/ci.yml` from `20` to `22`

### Step 2: Align engines field

- [ ] Update `package.json` `engines.node` to `>=22`

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test` locally
- [ ] Confirm no application code changes

## Completion Criteria

- [ ] CI workflow uses Node 22
- [ ] `engines.node` is `>=22`
- [ ] Local typecheck and test pass

## Git Commit Convention

- `fix(SP-067): description`

## Do NOT

- Change test files or pi-coding-agent imports
- Modify undici or dependency overrides unless Node 22 alone is insufficient

---

## Amendments (Added During Execution)
