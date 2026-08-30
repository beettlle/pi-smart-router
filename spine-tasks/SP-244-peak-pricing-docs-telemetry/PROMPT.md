# Task: SP-244 — Peak pricing explain telemetry and README

**Created:** 2026-08-30
**Size:** S

## Review Level: 1

**Assessment:** Finish #165 operator visibility — explain/logging shows peak vs off-peak rationale; README economics documents adapters + vendor doc links; mapper edge cases covered.
**Score:** 2/8 — Blast radius: 1 (docs + light telemetry), Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#165
- Bucket: feature
- Closes: #165
- Release: v0.20.0
- Manifest: `spine-tasks/_authoring/release-v0.20.0/manifest.md`

## Mission

Closes #165 — polish after SP-243:

1. Selection/explain path shows peak vs off-peak rationale when `SMART_ROUTER_LOG_ROUTING=1`
2. README economics section notes peak adapters + links to Z.ai and DeepSeek pricing docs
3. Plan-profile default credits documented; legacy override documented only
4. Mapper coverage tests for id patterns if gaps remain after SP-243

## Dependencies

- SP-243

## Context to Read First

- Issue #165 acceptance criteria (docs / explain)
- SP-243 landed adapter API + `pricing_window` field
- `README.md` economics sections
- `src/config/pi-model-mapper.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | `src/config/pi-model-mapper.ts`, explain/logging call sites under `src/**` or `.pi/extensions/smart-router/**`, `tests/unit/**` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `package.json` (version), core adapter schedule math (SP-243 owns) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/price-broker.test.ts tests/unit/smart-router-pricing.test.ts` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | README documents peak adapters + vendor links; explain/log path can show window; #165 closable |

## Steps

### Step 1: Explain + mapper gaps

- [ ] Ensure `SMART_ROUTER_LOG_ROUTING=1` surfaces `pricing_window` / rationale
- [ ] Add any missing mapper pattern tests

### Step 2: Testing and verification

- [ ] README economics section updated with Z.ai + DeepSeek links
- [ ] Contract `testCommand` green
- [ ] #165 closable with SP-243

## Completion Criteria

- [ ] Docs + explain telemetry complete; #165 closable

## Do NOT

- Change schedule math without tests
- Invent non-Z.ai/DeepSeek clocks
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `docs(SP-244): peak pricing explain telemetry and README (#165)`
