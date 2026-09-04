# Task: SP-258 — Vitest extension coverage include + threshold

**Created:** 2026-09-04
**Size:** S

## Review Level: 1

**Assessment:** Include `.pi/extensions/smart-router` in Vitest coverage thresholds so the primary runtime path is measured.
**Score:** 3/8 — Blast radius: 1 (coverage tooling), Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#144
- Bucket: feature
- Closes: #144
- Release: v0.22.0
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`

## Mission

Close #144 — make extension coverage real:

1. Add `.pi/extensions/smart-router/**/*.ts` to Vitest `coverage.include` (today only `src/**/*.ts`).
2. Set an initial lines threshold ≥80% for the combined gate, **or** document a measured baseline + ratchet plan in STATUS if current extension coverage is below 80% — the gate must still fail when coverage regresses (no theater). Prefer ≥80% if achievable with existing tests.
3. Ensure `npm run coverage:check` and CI enforce the include.
4. Do **not** rewrite large extension test files beyond minimal adds needed to meet the chosen threshold.
5. Leave README testing-section narrative to SP-262 unless a one-line pointer is required for the script name.

## Dependencies

- **None** (prefer Wave 0 with SP-255/SP-259; re-measure after SP-256 if thresholds shift)

## Context to Read First

- `vitest.config.ts` coverage block
- `package.json` `coverage:check` / `verify:ci`
- Issue #144 body
- Existing extension tests under `tests/`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `vitest.config.ts` |
| May change | `package.json` scripts only if coverage:check wiring needs it, `tests` for minimal coverage gaps, CI workflow if coverage job exclude list blocks extension |
| Must NOT change | `.pi/extensions/smart-router` runtime (except tests-only), `.eslintrc.cjs` (SP-257), embedding-provider (SP-259/260), `README.md` (SP-262), `package.json` version field, `config/release-gates.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run coverage:check` |
| fileScopeMustChange | `vitest.config.ts` |
| fileScopeMustNotChange | `README.md`, `package.json`, `src/domain/matching/embedding-provider.ts` |
| completionCriteria | Extension paths appear in coverage report; enforced threshold real; Closes #144 |

## Steps

### Step 0: Preflight

- [ ] Read current coverage include/thresholds
- [ ] Optionally measure extension-only baseline

### Step 1: Include extension + threshold

- [ ] Add extension glob to `coverage.include`
- [ ] Set ≥80% lines or documented ratchet with fail-on-regress
- [ ] Keep `coverage:check` / CI wired

### Step 2: Testing & Verification

- [ ] Contract `testCommand` green
- [ ] STATUS records measured % and threshold choice

## Completion Criteria

- [ ] Extension coverage gated; Closes #144

## Do NOT

- Split `smart-router-extension.test.ts` as a goal (out of scope per #144)
- Edit README theme docs (SP-262)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `chore(SP-258): extension coverage gate (#144)`

## Amendments

- None
