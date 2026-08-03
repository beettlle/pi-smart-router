# Task: SP-215 — Workload Heat Map + Soft Fleet Affinity

**Created:** 2026-08-02
**Size:** M

## Review Level: 1

**Assessment:** Privacy-safe workload heat histogram with soft first-turn affinity bias and pin-boundary hysteresis (Colibri learning-cache analog).
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 2, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#115
- Bucket: feature
- Closes: #115
- Release: v0.15.0
- Manifest: `spine-tasks/_authoring/release-v0.15.0/manifest.md`

## Mission

Closes #115 — Ship a privacy-safe **workload heat map** that soft-biases first-turn / cold-start fleet affinity from successful routes (tier/model/capability), plus optional live affinity updates at pin-safe boundaries with Colibri-style hysteresis (~25% + swap cap). Persist histogram across sessions under `.pi-smart-router/` and/or optional checked-in artifact with provenance. Soft bias must never override hard capability shortfall or absolute release gates. Export/import/clear path documented. Distinct from OATS (#77) and from degraded neural sandwich (#119 / SP-212). No FrugalGPT cascades; do not flip frugality defaults or absolute gates.

## Dependencies

- **None**

## Context to Read First

- GitHub #115 body (AC)
- `src/domain/routing/degraded-route-sandwich.ts` — distinct from heat (failover only)
- `src/domain/routing/expected-cost.ts` — soft-bias apply point (not pipeline)
- `src/domain/pinning/saar-session-state.ts` / `session-pinner.ts` — pin-safe boundaries
- Telemetry / dataset export paths used by #110
- `docs/qa/shadow-dogfood-protocol.md` — pointer only
- Manifest: `spine-tasks/_authoring/release-v0.15.0/manifest.md`

## Environment

- **Workspace:** `src/domain/routing/`, `src/domain/pinning/`, `tests/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/workload-heat.ts` (create), `src/domain/pinning/heat-affinity.ts` (create), `src/domain/routing/expected-cost.ts`, `tests/unit/workload-heat.test.ts` (create), `docs/qa/shadow-dogfood-protocol.md` |
| May change | `src/domain/types/**`, `src/config/defaults.ts` (heat knobs only), `src/infrastructure/telemetry/**`, `src/domain/pinning/saar-session-state.ts`, `src/domain/pinning/session-pinner.ts`, `tests/unit/**`, `tests/integration/**` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/infrastructure/hardware/**`, `.pi/extensions/smart-router/commands.ts`, `config/release-gates.json`, encoder defaults, `src/domain/routing/degraded-route-sandwich.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/workload-heat.test.ts` |
| fileScopeMustChange | `src/domain/routing/workload-heat.ts`, `src/domain/pinning/heat-affinity.ts`, `src/domain/routing/expected-cost.ts`, `tests/unit/workload-heat.test.ts`, `docs/qa/shadow-dogfood-protocol.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `config/release-gates.json`, `.pi/extensions/smart-router/commands.ts` |
| completionCriteria | Privacy-safe heat record + persist; soft-bias first-turn via expected-cost; hysteresis at pin-safe boundary; export/clear documented; unit tests; #115 closable. |

## Steps

### Step 1: Heat schema + persistence + soft bias

- [ ] Define privacy-safe heat record (no prompt text): fingerprint/cluster + tier/model + success proxy + count
- [ ] Persist histogram (operator-local `.pi-smart-router/` and/or optional artifact with provenance)
- [ ] Soft-bias first-turn / cold-start via `expected-cost` (never override shortfall / absolute gates)
- [ ] Unit tests for soft-bias on fixture fleets

**Plan-review checkpoint** — Confirm no raw prompt text in heat keys; shortfall gates still hard.

### Step 2: Hysteresis + export/clear + dogfood pointer

- [ ] Optional live affinity update at pin-safe boundaries with ~25% hysteresis + swap cap
- [ ] Export/import or clear path documented (llm-use router-export / router-reset analog)
- [ ] Pointer in `docs/qa/shadow-dogfood-protocol.md`
- [ ] Explicit: no frugality default or absolute-gate flips

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related expected-cost / pinning unit tests if touched
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #115 and close when complete

## Documentation Requirements

**Must Update:**
- `docs/qa/shadow-dogfood-protocol.md` — heat / affinity pointer (also in File Scope)

**Check If Affected:**
- `README.md` (owned by SP-216 — do not edit unless required; prefer protocol pointer)
- `docs/routing-roadmap.md`

## Completion Criteria

- [ ] Heat record + persist without prompt text
- [ ] Soft-bias first-turn via expected-cost; shortfall/gates preserved
- [ ] Hysteresis at pin-safe boundaries
- [ ] Export/clear documented
- [ ] #115 closable

## Git Commit Convention

- `feat(SP-215): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Edit `src/domain/pipeline/router-pipeline.ts` (SP-217 owns pipeline this wave)
- Edit `.pi/extensions/smart-router/commands.ts` or hardware placement modules (SP-216)
- Store raw prompt text in heat artifacts
- Flip encoder defaults or absolute release gates
- Close #95 / #110 / #116 / #117

## Amendments

None.
