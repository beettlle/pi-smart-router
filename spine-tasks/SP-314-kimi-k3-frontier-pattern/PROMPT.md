# Task: SP-314 — Kimi K3 / K3.1 frontier pattern rule

**Created:** 2026-11-15
**Size:** S

## Review Level: 1

**Assessment:** Bug — Kimi K3 / K3.1 ids fall through to UNKNOWN_DEFAULTS and are under-tiered vs registry price, so HyDRA almost never selects them.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 1
**Problem theory:** No `MODEL_PATTERN_RULES` entry for the K3 family; ids match nothing and inherit economical UNKNOWN_DEFAULTS while pricing is frontier-class.

## Source

- GitHub: beettlle/pi-smart-router#195
- Release: v1.4.0
- Bucket: bug
- Closes: #195

## Mission

Closes #195 — Add a `MODEL_PATTERN_RULES` entry in `src/config/pi-model-mapper.ts` that maps the Kimi K3 family to `FRONTIER_DEFAULTS`, placed next to GLM / DeepSeek rules (first match wins).

Suggested pattern (adapt if preflight shows false positives):

```ts
{ pattern: /^(kimi[-_.]?)?k3(\.\d+)?(-|$)/i, defaults: FRONTIER_DEFAULTS },
```

Cover ids: `k3`, `k3-256k`, `k3.1-pro`, `k3.1-pro-highspeed` (provider `kimi-coding`), and `kimi-k3`. Registry cost/limits already flow through `buildProfile`; only tier + capability defaults need correcting.

Before editing, run GitNexus impact analysis on `mapPiModelToProfile` and `MODEL_PATTERN_RULES`.

Unit-test depth for these ids is **SP-315** — this task may add a minimal smoke assertion if useful, but full table coverage belongs in SP-315.

## Dependencies

- None

## Context to Read First

- `src/config/pi-model-mapper.ts` (`MODEL_PATTERN_RULES`, `FRONTIER_DEFAULTS`, `UNKNOWN_DEFAULTS`, `mapPiModelToProfile`)
- `tests/unit/pi-model-mapper.test.ts`
- Issue beettlle/pi-smart-router#195

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts` |
| May change | `tests/unit/pi-model-mapper.test.ts` (minimal smoke only) |
| Must NOT change | `package.json`, `config/benchmark-profiles.json`, `scripts/**`, `src/domain/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-coverage.test.ts && bash scripts/spine-stet-contract-run.sh default SP-314` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts` |
| fileScopeMustNotChange | `package.json`, `config/benchmark-profiles.json`, `src/domain/`, `.review/` |
| completionCriteria | K3 / K3.1 family ids map to frontier-cloud via pattern_default; no false positives on substring ids; existing mapper tests green |

## Steps

### Step 0: Preflight

- [ ] GitNexus impact on `mapPiModelToProfile` / `MODEL_PATTERN_RULES`
- [ ] Confirm current tier for `kimi-coding/k3.1-pro` is UNKNOWN_DEFAULTS / economical

### Step 1: Implementation

- [ ] Add K3 family rule → `FRONTIER_DEFAULTS` in correct order; avoid matching `foo-k30`

### Step 2: Testing & Verification

- [ ] Smoke: at least one K3.1 id returns `frontier-cloud`
- [ ] Negative: substring-only ids stay UNKNOWN_DEFAULTS
- [ ] Run Contract `testCommand`

## Do NOT

- Add benchmark rows (SP-316)
- Change unrelated pattern families (Claude / Gemini / GLM)

## Completion Criteria

- [ ] #195 closed by pattern rule
- [ ] Contract green
