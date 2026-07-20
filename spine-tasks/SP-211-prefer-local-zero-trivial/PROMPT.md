# Task: SP-211 — Prefer Healthy local_zero on Trivial Turns

**Created:** 2026-07-19
**Size:** M

## Review Level: 1

**Assessment:** When healthy zero-tier is ready and cloud economical is scoped, prefer local_zero for trivial/no-tool turns (inverse of closed #97).
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#123
- Bucket: feature
- Closes: #123
- Release: v0.13.0
- Manifest: `spine-tasks/_authoring/release-v0.13.0/manifest.md`

## Mission

Closes #123 — Inverse of closed #97: with a healthy local zero-tier model ready and cloud economical also scoped, trivial / no-tool turns should select `local_zero` **or** explain must explicitly document why expected-cost prefers economical (deterministic and testable). Add a counterfactual fleet fixture (local + Anthropic-class economical + frontier) covering trivial vs agentic prompts. Non-regression: #97 path — agentic cleanup / destructive prompts still not forced to zero-tier inappropriately. Respect tok/s readiness (#84) if relevant.

## Dependencies

- **Task:** SP-209 (`router-pipeline.ts` force/prefer path settles before local_zero tier edits)

## Context to Read First

- GitHub #123 body (AC)
- Closed #97 / SP-176 triage repo-cleanup tier (inverse failure mode)
- `src/domain/pipeline/router-pipeline.ts` — `localZeroTierStage`
- Expected-cost / P(success) tier pick after low-intensity
- Throughput / tok/s gate (#84) if it blocks healthy local
- `docs/qa/shadow-dogfood-protocol.md` — optional observation tip

## Environment

- **Workspace:** `src/domain/pipeline/`, `src/domain/pricing/` or expected-cost modules, `tests/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts`, `tests/unit/local-zero-prefer-trivial.test.ts` (create) |
| May change | expected-cost / tier-selection modules under `src/domain/**`, `src/config/defaults.ts` (local_zero knobs only if needed), `tests/unit/**`, `tests/integration/**`, `docs/**` |
| Must NOT change | `config/release-gates.json`, encoder defaults, `src/config/pi-model-mapper.ts`, force_model_id semantics beyond non-regression |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/local-zero-prefer-trivial.test.ts` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts`, `tests/unit/local-zero-prefer-trivial.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `docs/capability-profile-coverage.md` |
| completionCriteria | Healthy zero-tier + trivial/no-tools → zero-tier selected OR explain documents deterministic expected-cost prefer; counterfactual fixture trivial vs agentic; #97 non-regression; #123 closable. |

## Steps

### Step 1: Preference / explain path

- [ ] Reproduce cloud-economical dominance on trivial/no-tool with healthy local ready
- [ ] Prefer `local_zero` when healthy + trivial/no-tools, **or** make expected-cost prefer economical explicit in explain (deterministic)
- [ ] Respect existing local_zero tool-use / tok/s gates (#98/#84)
- [ ] Counterfactual fleet fixture: local + economical + frontier — trivial vs agentic

**Plan-review checkpoint** — Confirm #97 agentic/destructive path still not forced to zero-tier.

### Step 2: Non-regression

- [ ] #97-style agentic cleanup / destructive prompts not forced to zero-tier
- [ ] Force/prefer (SP-209) and pin-break (SP-210) behaviors unchanged

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related local_zero / triage unit tests if touched
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #123 and close when complete

## Documentation Requirements

**Must Update:**
- None required unless operator-facing preference needs a short README/protocol note — list path in File Scope May change if added

**Check If Affected:**
- `docs/qa/shadow-dogfood-protocol.md`
- `README.md`

## Completion Criteria

- [ ] Trivial/no-tool + healthy local → local_zero **or** explicit explain for economical prefer
- [ ] Counterfactual fixture green (trivial vs agentic)
- [ ] #97 non-regression green
- [ ] #123 closable

## Git Commit Convention

- `feat(SP-211): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip encoder defaults or absolute release gates
- Revert #97 protections
- Rewrite force/prefer (SP-209) or pin-break (SP-210) beyond non-regression
- Close #95 / #110

## Amendments

None.
