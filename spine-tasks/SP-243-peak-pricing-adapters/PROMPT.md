# Task: SP-243 — Peak/off-peak pricing adapters for Z.ai and DeepSeek

**Created:** 2026-08-30
**Size:** M

## Review Level: 1

**Assessment:** Add injectable-clock peak/off-peak adapters for Z.ai GLM credits and DeepSeek API schedules; soft-bias estimate/frugality effective cost; leave non-target providers unchanged.
**Score:** 4/8 — Blast radius: 2 (pricing + estimate path), Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#165
- Bucket: feature
- Partial: #165 (mapper explain + README polish is SP-244)
- Release: v0.20.0
- Manifest: `spine-tasks/_authoring/release-v0.20.0/manifest.md`

## Mission

Partial #165 — pre-route **schedule** path for documented peak vs off-peak multipliers:

### Z.ai (default plan-profile `credits`)

- Peak Mon–Fri 14:00–18:00 Asia/Singapore (UTC+8); weekends off-peak all day
- Credits plan: off-peak model usage **0.5×** standard; support documented legacy multipliers via override only (do not scrape live account plan)

### DeepSeek pay-as-you-go

- Peak 01:00–04:00 and 06:00–10:00 UTC Mon–Fri; else off-peak
- Off-peak rates **half** of peak on cache-hit input, cache-miss input, and output

### Behavior

1. Small `PeakPricingAdapter` (or equiv.) under pricing domain/infra with injectable `now`
2. Map fleet provider/model ids (`zai` / `glm` / `deepseek` patterns in `pi-model-mapper`) to adapters
3. Soft-bias via adjusted effective `cost_per_1m` / estimate — **no hard ban**
4. Telemetry field `pricing_window: peak | off_peak | none` (full explain polish OK in SP-244)
5. Do **not** invent clocks for OpenAI/Anthropic/Gemini; do **not** expand #164

## Dependencies

- Prefer after SP-242 if both touch `estimateRoutingCost` heavily; else may run after SP-241. Declared: SP-242 (serialize economics hot path).

## Context to Read First

- Issue #165 — schedules, acceptance, out of scope
- `src/infrastructure/pricing/price-broker.ts` — `resolveFrugalityCostPer1M`
- `src/infrastructure/telemetry/routing-telemetry.ts` — `estimateRoutingCost`
- `src/config/pi-model-mapper.ts`
- `src/domain/pricing/` if present
- `tests/unit/price-broker.test.ts`, `tests/unit/smart-router-pricing.test.ts`
- Docs: Z.ai Coding Plan overview / usage-revision; DeepSeek Models & Pricing

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/pricing/price-broker.ts` |
| May change | `src/domain/pricing/**`, `src/infrastructure/pricing/**`, `src/infrastructure/telemetry/routing-telemetry.ts`, `src/config/pi-model-mapper.ts`, `tests/unit/price-broker.test.ts`, `tests/unit/smart-router-pricing.test.ts`, `tests/unit/**` (new adapter tests) |
| Must NOT change | `.pi/extensions/smart-router/**` (usage capture is #164), `README.md` (SP-244), `package.json` (version), `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/price-broker.test.ts tests/unit/smart-router-pricing.test.ts` |
| fileScopeMustChange | `src/infrastructure/pricing/price-broker.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Frozen-clock unit tests change effective cost inside/outside Z.ai and DeepSeek windows (e.g. off-peak ≈ 0.5× peak for DeepSeek / credits); non-target models unchanged; fail open; plan-profile default credits for Z.ai |

## Steps

### Step 1: Adapters + injectable clock

- [ ] Implement Z.ai + DeepSeek schedule adapters with injectable `now`
- [ ] Default Z.ai plan-profile `credits`; legacy multipliers only via documented override
- [ ] Map provider/model ids; unknown → `pricing_window: none`

### Step 2: Wire into estimate / frugality

- [ ] Consult adapters from price-broker / `estimateRoutingCost` path
- [ ] Soft-bias only; no hard ban
- [ ] Record `pricing_window` on telemetry when applied

### Step 3: Testing and verification

- [ ] Frozen-clock tests for peak vs off-peak for both vendors
- [ ] Non-Z.ai/DeepSeek unchanged
- [ ] Contract `testCommand` green (add new test file to command if created)

## Completion Criteria

- [ ] Adapters wired with tests; Partial #165 (docs/explain polish → SP-244)

## Do NOT

- Invent schedules for OpenAI / Anthropic / Gemini
- Live Z.ai account plan detection
- Replace #164 calibration behavior
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version
- Large README rewrite (SP-244)

## Git Commit Convention

- `feat(SP-243): peak/off-peak pricing adapters for Z.ai and DeepSeek (#165)`
