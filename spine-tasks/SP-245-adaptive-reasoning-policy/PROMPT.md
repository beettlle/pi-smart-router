# Task: SP-245 — Adaptive reasoning policy and delegation option merge

**Created:** 2026-08-30
**Size:** M

## Review Level: 1

**Assessment:** Compute effective reasoning/thinking intensity from turn signals; merge into delegation stream options without lowering an explicit higher operator `/thinking`; fail open on non-supporting models.
**Score:** 4/8 — Blast radius: 2 (extension delegation), Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#166
- Bucket: feature
- Partial: #166 (operator knobs + README + telemetry fields polish is SP-246)
- Release: v0.20.0
- Manifest: `spine-tasks/_authoring/release-v0.20.0/manifest.md`

## Mission

Partial #166 — choose **effective `reasoning` / thinking intensity** per turn so chatty models stay concise on routine tool loops:

1. Policy module consulted when building delegation stream options
2. Policy table defaults:
   - `main_loop` / cheap tool turns → `low` or `minimal`
   - Planning / hard / frontier escalate → `medium` or `high`
   - Pin continuation inherits session unless turn class upgrades
3. **Never lower** below an explicit operator `/thinking` that is already higher; never raise past model-supported max
4. Merge policy output with caller options before `delegateStream` (respect `DELEGATION_CALLER_OPTION_KEYS` / caller `reasoning` / `thinkingBudgets`)
5. Fail open if provider ignores reasoning options
6. Optional light conciseness developer/system suffix only when effective level is `low`/`minimal` **and** profile `verbosity_factor` is high (GLM-class) — not a full prompt rewrite

Operator enable/disable + floor/ceiling config + README comparison to `lambda_verbosity` deferred to SP-246 (may add minimal enable default-on here if needed to wire).

## Dependencies

- None vs #164/#165 (disjoint primary path). May parallel SP-241. Declared: [] 

## Context to Read First

- Issue #166 — product rules, acceptance, related #71 planning_delegate
- `.pi/extensions/smart-router/delegation-runtime.ts` — `DELEGATION_CALLER_OPTION_KEYS`
- `.pi/extensions/smart-router/route-and-delegate.ts`, `stream-delegation.ts`, `planning-delegate.ts`
- Turn envelope / stage signals available at route time
- Frugality `verbosity_factor` / `lambda_verbosity` (selection only — do not confuse with this policy)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/delegation-runtime.ts` |
| May change | `.pi/extensions/smart-router/route-and-delegate.ts`, `.pi/extensions/smart-router/**`, `src/domain/**` (new policy module), `tests/unit/**`, `tests/integration/pi-extension.test.ts`, `tests/integration/planning-delegate.test.ts` |
| Must NOT change | `src/infrastructure/pricing/**`, `src/infrastructure/telemetry/routing-telemetry.ts` (economics trains), `README.md` (SP-246), `package.json` (version), `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/integration/pi-extension.test.ts tests/integration/planning-delegate.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/delegation-runtime.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Unit/extension tests cover policy matrix + explicit higher thinking wins; non-supporting models fail open; delegated options get lowered/raised `reasoning` from turn class |

## Steps

### Step 1: Policy module + unit tests

- [ ] Add adaptive-reasoning policy module (domain or extension) with matrix tests
- [ ] Explicit higher `/thinking` / caller reasoning never lowered
- [ ] Model max ceiling respected; fail open when unsupported

### Step 2: Wire into delegation options

- [ ] Consult policy from route-and-delegate / stream option build
- [ ] Merge before `delegateStream`; preserve caller option keys contract
- [ ] Optional conciseness suffix only for low/minimal + high `verbosity_factor`

### Step 3: Testing and verification

- [ ] Extension test asserts delegated options reflect turn class
- [ ] Contract `testCommand` green (add dedicated unit file to command if created)
- [ ] Partial #166 — config/docs/telemetry polish → SP-246

## Completion Criteria

- [ ] Policy + merge wired with tests; Partial #166

## Do NOT

- Rewrite model personality wholesale
- Disable tools or replace pi footer
- Implement #164/#165 economics
- Confuse with `lambda_verbosity` (selection-only)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version
- Large README rewrite (SP-246)

## Git Commit Convention

- `feat(SP-245): adaptive reasoning policy for delegation options (#166)`
