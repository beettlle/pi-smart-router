# Task: SP-208 — Multi-Fleet Capability Aliases + Coverage

**Created:** 2026-07-19
**Size:** M

## Review Level: 1

**Assessment:** Extend #108 coverage docs/tests for Copilot/Gemini/Anthropic dogfood IDs; aliases where silent provider collapse is wrong.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#124
- Bucket: documentation
- Closes: #124
- Release: v0.13.0
- Manifest: `spine-tasks/_authoring/release-v0.13.0/manifest.md`

## Mission

Closes #124 — Extend capability-profile coverage for common multi-fleet dogfood IDs (`github-copilot/*`, Gemini, Anthropic catalog strings). Document each as `benchmark` or intentional `pattern_default` with a one-line rationale. Add aliases/rows where silent collapse to another provider family is incorrect. Link from `docs/qa/shadow-dogfood-protocol.md` as a fleet-agnostic multi-fleet note. Keep #75 and #108 closed (do not re-implement core ingest).

## Dependencies

- **None**

## Context to Read First

- GitHub #124 body (AC)
- `docs/capability-profile-coverage.md` (from SP-198 / #108)
- `src/config/pi-model-mapper.ts`
- `config/benchmark-profiles.json`
- `tests/unit/pi-model-mapper-coverage.test.ts`
- `docs/qa/shadow-dogfood-protocol.md`
- Closed #75, #108

## Environment

- **Workspace:** `docs/`, `src/config/`, `config/`, `tests/unit/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `docs/capability-profile-coverage.md`, `tests/unit/pi-model-mapper-coverage.test.ts`, `docs/qa/shadow-dogfood-protocol.md` |
| May change | `config/benchmark-profiles.json`, `src/config/pi-model-mapper.ts`, `README.md`, `scripts/**`, `package.json` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/**`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper-coverage.test.ts` |
| fileScopeMustChange | `docs/capability-profile-coverage.md`, `tests/unit/pi-model-mapper-coverage.test.ts`, `docs/qa/shadow-dogfood-protocol.md` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Coverage doc + tests list Copilot/Gemini/Anthropic dogfood ids; each benchmark or intentional pattern_default; aliases where provider collapse wrong; protocol multi-fleet note; #124 closable; #75/#108 stay closed. |

## Steps

### Step 1: Coverage table + aliases

- [ ] Extend primary fleet ID list for common Copilot / Gemini / Anthropic dogfood strings
- [ ] Update `docs/capability-profile-coverage.md` rows: id → `benchmark` \| `pattern_default` + one-line rationale
- [ ] Add aliases/profile rows where silent collapse across provider families is incorrect
- [ ] Extend `tests/unit/pi-model-mapper-coverage.test.ts` for the new IDs

**Plan-review checkpoint** — Confirm #75/#108 remain closed conceptually (no re-ingest redesign).

### Step 2: Protocol cross-link

- [ ] Add fleet-agnostic multi-fleet note + link in `docs/qa/shadow-dogfood-protocol.md`
- [ ] Optional README one-liner only if needed

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run routing:verify-benchmark-profiles` if profiles/mapper changed
- [ ] Run `npm run verify:ci` if time allows; at minimum typecheck + coverage unit test
- [ ] Coverage: `npm run coverage:check` if application code changed — ≥77% line coverage
- [ ] Comment on #124 and close when complete

## Documentation Requirements

**Must Update:**
- `docs/capability-profile-coverage.md`
- `docs/qa/shadow-dogfood-protocol.md`

**Check If Affected:**
- `README.md`
- `docs/routing-roadmap.md` — leave unless a one-line status pointer is required

## Completion Criteria

- [ ] Copilot/Gemini/Anthropic dogfood IDs documented with source + rationale
- [ ] Coverage tests assert expected sources / aliases
- [ ] Protocol multi-fleet note present
- [ ] #75 and #108 remain closed
- [ ] #124 closable

## Git Commit Convention

- `feat(SP-208): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Re-implement #75 core ingest or reopen #108
- Change shortfall τ, frugality, absolute gates, or encoder defaults
- Edit `src/domain/pipeline/router-pipeline.ts` or pinning (owned by SP-209/SP-210)
- Close #95 / #110

## Amendments

None.
