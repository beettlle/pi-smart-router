# Task: SP-252 — fail_closed_on_missing_weights + sandwich integration

**Created:** 2026-09-02
**Size:** S

## Review Level: 1

**Assessment:** Optional operator fail-closed when weights missing; integrate SP-251 reason codes with degraded neural sandwich (#119).
**Score:** 3/8 — Blast radius: 2 (config + matching/sandwich), Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#148
- Bucket: feature
- Closes: #148
- Release: v0.21.0
- Manifest: `spine-tasks/_authoring/release-v0.21.0/manifest.md`

## Mission

Closes #148 — finish **operator fail-closed + sandwich alignment** after SP-251:

1. Add optional operator config `fail_closed_on_missing_weights` (Zod + defaults; default **false** = current fail-open placeholders).
2. When enabled and HyDRA/K4 weights are missing/invalid: do not silently treat placeholders as learned production heads — fail closed or route through degraded sandwich with SP-251 reason codes (`hydra_weights_missing`, `k4_heads_placeholder`) visible on the decision path.
3. Integrate with degraded neural sandwich (#119 / SP-212) reason-code surfaces where applicable (`neural_misconfigured` or related — prefer existing kinds over inventing a fourth cascade).
4. Unit tests: fail-closed path asserted; default remains fail-open.
5. Do **not** edit README reason-code table (SP-253). Do **not** flip `#96` defaults.

## Dependencies

- **Task:** SP-251 (reason codes must exist)

## Context to Read First

- Issue #148 — fail_closed + sandwich acceptance
- `Parent split: SP-251 — missing-weights reason codes`
- SP-251 constants + metadata plumbing
- `src/domain/types/schemas.ts` — `DegradedRouteConfigSchema` / `OperatorConfigSchema`
- `src/config/defaults.ts` — `DEFAULT_OPERATOR_CONFIG`
- `src/domain/routing/degraded-route-sandwich.ts` — neural failure kinds
- Prefer narrow matcher/config changes; avoid large `router-pipeline.ts` rewrites unless a tiny call-site is required

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/schemas.ts` |
| May change | `src/config/defaults.ts`, `src/domain/matching/hydra-matcher.ts`, `src/domain/matching/modernbert-heads.ts`, `src/domain/routing/degraded-route-sandwich.ts`, minimal `src/domain/pipeline/router-pipeline.ts` only if required to honor the flag, `tests/unit/**` (schemas, matchers, sandwich) |
| Must NOT change | `README.md` (SP-253), `package.json` (version), `#96` default enablement |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/hydra-matcher.test.ts tests/unit/modernbert-heads.test.ts` |
| fileScopeMustChange | `src/domain/types/schemas.ts` |
| fileScopeMustNotChange | `README.md`, `package.json` |
| completionCriteria | fail_closed_on_missing_weights wired (default false); fail-closed path tested; SP-251 reason codes surface on sandwich/decision path; #148 closable |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-251 reason codes are importable
- [ ] Choose schema home (operator vs degraded_route nested)

### Step 1: Config + fail-closed behavior

- [ ] Add Zod field + default false
- [ ] Honor flag in matcher / pipeline fail-closed path
- [ ] Align sandwich reason codes with SP-251 codes where applicable

### Step 2: Testing & Verification

- [ ] Unit tests: default fail-open; fail-closed when enabled
- [ ] Contract `testCommand` green
- [ ] #148 closable with SP-251

## Completion Criteria

- [ ] Fail-closed option + sandwich integration complete; #148 closable

## Do NOT

- Default fail-closed to true (would surprise existing installs)
- Flip modernbert_k4 defaults (#96)
- Edit README (SP-253)
- Large unrelated RouterPipeline refactor (#143)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-252): fail_closed_on_missing_weights (#148)`

## Amendments

- None
