# Task: SP-227 — Reconcile docs with 0.16.2 runtime

**Created:** 2026-08-22
**Size:** M

## Review Level: 1

**Assessment:** Fix operator-config example validation drift and README/quickstart/roadmap staleness.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#152
- Bucket: documentation
- Closes: #152
- Release: v0.17.0
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## Mission

Closes #152 — Reconcile `config/operator-config.json.example`, README, quickstart, and `docs/routing-roadmap.md` with 0.16.2+ runtime. Example config must pass `OperatorConfigSchema.parse()` in CI test. README version banner matches `package.json`. Quickstart: dataset shipped, Node ≥22. Roadmap: refresh last-updated, closed issue pointers, 0.17 audit table, pipeline ASCII for 0.16 stages.

## Dependencies

- None

## Context to Read First

- `config/operator-config.json.example`
- `README.md`, `specs/001-build-smart-router/quickstart.md`, `docs/routing-roadmap.md`
- `src/domain/types/schemas.ts` — `OperatorConfigSchema`
- `spine-tasks/_authoring/issues/README.md` — audit issue table

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/operator-config.json.example`, `README.md`, `specs/001-build-smart-router/quickstart.md`, `docs/routing-roadmap.md` |
| May change | `tests/unit/operator-config.test.ts` or new contract test for example config |
| Must NOT change | `src/domain/pipeline/**`, `.pi/extensions/**` routing code |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm run lint` |
| fileScopeMustChange | `config/operator-config.json.example` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | operator-config.example validates via Zod in test; README/quickstart/roadmap accurate; #152 closable |

## Steps

### Step 1: Fix operator-config example and CI test

- [ ] Add missing `planning_delegate` timeout fields
- [ ] Add/extend test: `OperatorConfigSchema.parse()` on example file

### Step 2: Refresh operator-facing docs

- [ ] README version banner → package.json version
- [ ] Quickstart: dataset shipped, Node ≥22
- [ ] Roadmap: last updated, issue pointers, 0.17 audit table, pipeline ASCII

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Example config validates in CI
- [ ] Docs match 0.16.2+ runtime
- [ ] #152 closable

## Do NOT

- Implement routing features
- Change release gate thresholds
