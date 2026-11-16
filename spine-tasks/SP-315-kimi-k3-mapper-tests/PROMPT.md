# Task: SP-315 — unit coverage for Kimi K3 / K3.1 mapper ids

**Created:** 2026-11-15
**Size:** S

## Review Level: 1

**Assessment:** Test coverage for the SP-314 Kimi K3 pattern rule — pins frontier tier, registry cost/limits, and negative cases.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#196
- Release: v1.4.0
- Bucket: feature
- Closes: #196

## Mission

Closes #196 — Add unit tests for the Kimi K3-family pattern rule from SP-314 / #195.

For each id in `k3`, `k3-256k`, `k3.1-pro`, `k3.1-pro-highspeed` (provider `kimi-coding`), plus `kimi-k3`, assert `mapPiModelToProfile`:

- returns tier `frontier-cloud`
- returns `capability_source: 'pattern_default'` when there is no benchmark row
- keeps `fallback_cost_per_1m` at the registry value (average of input/output): $6 for `k3.1-pro` (input $2, output $10) and $12 for `k3.1-pro-highspeed` (input $4, output $20) — assert against whatever the installed pi registry returns; if registry values differ from the issue examples, record actuals in STATUS and assert those
- carries `pi_registry_limits` of `max_input_tokens: 1048576` and `max_output_tokens: 131072` when the registry provides them

Negative cases:

- ids that only contain `k3` as a substring (e.g. `foo-k30`) stay on `UNKNOWN_DEFAULTS`
- `kimi-for-coding` and `kimi-for-coding-highspeed` keep their current mapping unless SP-314 deliberately changed them

## Dependencies

- SP-314

## Context to Read First

- `src/config/pi-model-mapper.ts`
- `tests/unit/pi-model-mapper.test.ts`, `tests/unit/pi-model-mapper-coverage.test.ts`
- Issue beettlle/pi-smart-router#196

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None (uses installed pi registry in tests)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/unit/pi-model-mapper.test.ts` |
| May change | `tests/unit/pi-model-mapper-coverage.test.ts` |
| Must NOT change | `src/config/pi-model-mapper.ts`, `package.json`, `config/benchmark-profiles.json`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-coverage.test.ts && bash scripts/spine-stet-contract-run.sh lenient SP-315` |
| fileScopeMustChange | `tests/unit/pi-model-mapper.test.ts` |
| fileScopeMustNotChange | `src/config/pi-model-mapper.ts`, `package.json`, `config/benchmark-profiles.json`, `.review/` |
| completionCriteria | All listed K3 ids asserted frontier + pattern_default; cost/limits pinned; negatives green |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-314 rule is present; print registry cost/limits for k3.1-pro ids

### Step 1: Implementation

- [ ] Add `it.each` (or equivalent) table covering positive and negative cases

### Step 2: Testing & Verification

- [ ] Run Contract `testCommand`

## Do NOT

- Re-edit the pattern rule (SP-314)
- Add benchmark grounding (SP-316)

## Completion Criteria

- [ ] #196 closed by unit coverage
- [ ] Contract green
