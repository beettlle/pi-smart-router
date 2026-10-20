# Task: SP-299 — pi registry limits before tier defaults

**Created:** 2026-10-19
**Size:** M

## Review Level: 2

**Assessment:** Limits-precedence bug — tier defaults shadow pi registry `contextWindow` / `maxTokens` (glm-5.3-flash capped at 8192 output).
**Score:** 5/8 — Blast radius: 3, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#177
- Epic: beettlle/pi-smart-router#182
- Release: v1.2.1
- Bucket: bug
- Closes: #177

## Mission

`resolveLimits` in `src/infrastructure/pricing/price-broker.ts` resolves YAML → LiteLLM → tier default. `applyCatalogPricesToFleet` always writes the result into `profile.limits`, so the pi-registry fallback in `src/domain/delegation/output-headroom.ts` (`registryModel.maxTokens` / `.contextWindow`) is unreachable. Insert pi registry limits as the third source: **YAML → LiteLLM → pi registry → tier default**.

Suggested shape (worker may refine, keep it minimal):

- Extend `PiModelInput` / `registryModelsToFleetInput` (in `.pi/extensions/smart-router/fleet-bootstrap.ts`) to carry optional `contextWindow` / `maxTokens` from pi `Model<Api>`.
- Pass a `ReadonlyMap<modelId, { max_input_tokens?, max_output_tokens? }>` (or per-profile field) into `applyCatalogPricesToFleet` / `resolveLimits`; also apply it on the `!catalog` path.
- Ignore non-positive registry values.

## Dependencies

- SP-298 (shares `src/config/pi-model-mapper.ts` and pricing tests)
- SP-297 (may touch `.pi/extensions/smart-router/fleet-bootstrap.ts` for type drift)

## Context to Read First

- `src/infrastructure/pricing/price-broker.ts` (`resolveLimits`, `applyCatalogLimitsToFleet`, `applyCatalogPricesToFleet`)
- `.pi/extensions/smart-router/fleet-bootstrap.ts` (`registryModelsToFleetInput`, `discoverFleet`)
- `src/config/pi-model-mapper.ts` (`PiModelInput`)
- `src/domain/delegation/output-headroom.ts`
- Issue beettlle/pi-smart-router#177

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/pricing/price-broker.ts`, `.pi/extensions/smart-router/fleet-bootstrap.ts`, `tests/unit/price-broker.test.ts` |
| May change | `src/config/pi-model-mapper.ts`, `tests/unit/smart-router-pricing.test.ts`, `tests/unit/delegation-headroom.test.ts` |
| Must NOT change | `package.json`, `src/domain/routing/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/price-broker.test.ts tests/unit/smart-router-pricing.test.ts tests/unit/delegation-headroom.test.ts` |
| fileScopeMustChange | `src/infrastructure/pricing/price-broker.ts`, `.pi/extensions/smart-router/fleet-bootstrap.ts` |
| fileScopeMustNotChange | `package.json`, `src/domain/routing/` |
| completionCriteria | Precedence YAML → LiteLLM → pi registry → tier default; #177 unit cases green |

## Steps

### Step 0: Preflight

- [ ] Read existing coverage in `tests/unit/price-broker.test.ts` and `tests/unit/delegation-headroom.test.ts`

### Step 1: Implementation

- [ ] Carry pi registry `contextWindow` / `maxTokens` from `discoverFleet` into limits resolution
- [ ] Update `resolveLimits` precedence and the `!catalog` path; update its doc comment

### Step 2: Testing & Verification

- [ ] Test: `zai/glm-5.3-flash` with no LiteLLM limits and registry `{contextWindow: 1_000_000, maxTokens: 131_072}` → `max_input_tokens = 1_000_000`, `max_output_tokens = 131_072`
- [ ] Test: YAML and LiteLLM limits still win over registry
- [ ] Test: `computeOutputHeadroom` for that profile returns `maxTokens > 8192` when the window allows
- [ ] Run Contract `testCommand`

## Do NOT

- Change context-fit estimation (#178) or degenerate-output handling (#181)
- Add telemetry columns (optional `limits_source` is out of scope for this patch)

## Completion Criteria

- [ ] #177 acceptance criteria met
- [ ] Contract tests green
