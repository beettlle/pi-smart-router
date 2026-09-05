# Task: SP-276 — telemetry pinner split 143

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Split routing-telemetry / touch session-pinner as needed for ports.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#143
- Bucket: feature
- Closes: #143
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Closes #143 — sub-tasks: split oversized `routing-telemetry.ts` into bounded builders where still blocking ports; touch `session-pinner.ts` only as needed for port inversion leftovers. Prefer smallest change that finishes #143 acceptance.

## Dependencies

- **SP-275**

## Context to Read First

- Issue #143
- routing-telemetry.ts
- session-pinner.ts

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/` |
| May change | `tests/**` |
| Must NOT change | `package.json version`, `Encoder defaults` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test && npm run coverage:check` |
| fileScopeMustChange | `src/` |
| fileScopeMustNotChange | `package.json version field` |
| completionCriteria | Closes #143; typecheck/tests/coverage green; STATUS notes files split |

## Steps

### Step 0: Preflight

- [ ] Measure routing-telemetry.ts / session-pinner.ts sizes
- [ ] List remaining #143 checkboxes

### Step 1: Split / finish ports leftovers

- [ ] Bounded telemetry builders as needed
- [ ] Minimal pinner touch

### Step 2: Testing & Verification

- [ ] Contract testCommand green

## Completion Criteria

- [ ] Closes #143; typecheck/tests/coverage green; STATUS notes files split

## Do NOT

- Unrelated refactors
- Bump package version
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `refactor(SP-276): finish pipeline ports split (#143)`
