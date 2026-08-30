# Task: SP-246 — Adaptive reasoning operator config, telemetry, and README

**Created:** 2026-08-30
**Size:** S

## Review Level: 1

**Assessment:** Ship operator enable/disable + floor/ceiling knobs, telemetry fields, and README distinguishing adaptive reasoning vs `lambda_verbosity` vs `/thinking`.
**Score:** 2/8 — Blast radius: 1 (config/docs/telemetry), Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#166
- Bucket: feature
- Closes: #166
- Release: v0.20.0
- Manifest: `spine-tasks/_authoring/release-v0.20.0/manifest.md`

## Mission

Closes #166 — finish operator surface after SP-245:

1. Operator knobs in operator-config / env: enable/disable adaptive reasoning; optional floor/ceiling — **not** a free-form verbosity percent
2. Telemetry: `reasoning_level_requested`, `reasoning_level_applied`, `reason_code` (e.g. `turn_envelope_main_loop`)
3. README operator section: adaptive reasoning vs `lambda_verbosity` (selection) vs `/thinking` (override)
4. Document fail-open behavior for non-supporting models

## Dependencies

- SP-245

## Context to Read First

- Issue #166 acceptance (config, telemetry, README)
- SP-245 policy API + merge points
- Operator config schemas / defaults in repo
- `README.md` operator / frugality sections

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | operator-config / env schema paths under `src/**` or `.pi/extensions/smart-router/**`, telemetry record fields, `tests/unit/**` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/infrastructure/pricing/**`, `package.json` (version) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/integration/pi-extension.test.ts` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Enable/disable + floor/ceiling documented and wired; telemetry fields present; README distinguishes adaptive reasoning vs lambda_verbosity vs /thinking; #166 closable |

## Steps

### Step 1: Config + telemetry fields

- [ ] Wire enable/disable + optional floor/ceiling
- [ ] Emit `reasoning_level_requested`, `reasoning_level_applied`, `reason_code`

### Step 2: Testing and verification

- [ ] README operator section updated
- [ ] Contract `testCommand` green
- [ ] #166 closable with SP-245

## Completion Criteria

- [ ] Config, telemetry, README complete; #166 closable

## Do NOT

- Free-form “verbosity percent” knob
- Rewrite personality prompts wholesale
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `docs(SP-246): adaptive reasoning operator config and README (#166)`
