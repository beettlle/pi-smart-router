# Task: SP-212 — Degraded Neural Failover Sandwich

**Created:** 2026-08-02
**Size:** M

## Review Level: 1

**Assessment:** When encoder/neural routing fails or exceeds budget, fall open through learned → heuristic/pattern → safe default with explain codes (llm-use sandwich pattern).
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#119
- Bucket: feature
- Closes: #119
- Release: v0.14.0
- Manifest: `spine-tasks/_authoring/release-v0.14.0/manifest.md`

## Mission

Closes #119 — Implement a degraded model-routing path when encoder/neural stages fail, misconfigure, or time out: never crash the host; emit reason codes. Optional privacy-safe learned map (requirement fingerprint / cluster id → preferred tier/mode — **not** raw prompt) plus optional operator pattern pack as cheap overlay. Explain/telemetry must expose `route_path=neural|learned|heuristic|safe_default` (+ confidence). Distinct from #115 soft heat affinity (healthy-path); this is failover / skip-expensive-stage. No FrugalGPT cascades; no acceptance criterion requires another beettlle package.

## Dependencies

- **None**

## Context to Read First

- GitHub #119 body (AC)
- `src/domain/matching/hydra-matcher.ts` — neural/encoder failure surfaces
- `src/domain/pipeline/router-pipeline.ts` — matcher / safe default path
- `src/domain/triage/entropy-check.ts` — confounder guards (learned store must not be poisonable)
- `docs/routing-roadmap.md` — pre-generation-only constraint
- Manifest: `spine-tasks/_authoring/release-v0.14.0/manifest.md`

## Environment

- **Workspace:** `src/domain/matching/`, `src/domain/pipeline/`, `src/domain/routing/` (new module OK), `tests/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/degraded-route-sandwich.ts` (create), `src/domain/pipeline/router-pipeline.ts`, `tests/unit/degraded-route-sandwich.test.ts` (create) |
| May change | `src/domain/matching/hydra-matcher.ts`, `src/domain/types/**`, `src/config/defaults.ts` (degrade knobs only), `src/infrastructure/telemetry/routing-telemetry.ts`, `tests/unit/**`, `tests/integration/**`, `README.md`, `docs/routing-roadmap.md` |
| Must NOT change | `config/release-gates.json`, encoder defaults (`modernbert_k4` / `hydra_heads`), `.pi/extensions/smart-router/planning-delegate.ts`, virtual-cost math |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/degraded-route-sandwich.test.ts` |
| fileScopeMustChange | `src/domain/routing/degraded-route-sandwich.ts`, `src/domain/pipeline/router-pipeline.ts`, `tests/unit/degraded-route-sandwich.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `.pi/extensions/smart-router/planning-delegate.ts` |
| completionCriteria | Encoder/neural failure inject → sandwich selects safe path with `route_path` reason; learned store has no prompt text; unit tests green; #119 closable. |

## Steps

### Step 1: Sandwich module + wiring

- [ ] Add degrade path: neural fail/timeout → optional learned → optional pattern → safe economical/frontier default
- [ ] Wire into pipeline/matcher so host never crashes on encoder errors
- [ ] Telemetry/explain: `route_path=neural|learned|heuristic|safe_default` + confidence
- [ ] Learned keys: fingerprint/cluster only — never raw prompt

**Plan-review checkpoint** — Confirm distinct from #115 heat affinity; no FrugalGPT cascade.

### Step 2: Pattern pack + failure injection tests

- [ ] Optional operator pattern pack: deny-by-default / fail closed on invalid regex; never alone override capability shortfall
- [ ] Unit tests: inject encoder error → sandwich + reason codes
- [ ] Document degrade contract briefly (README or roadmap pointer)

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related matcher/pipeline unit tests if touched
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #119 and close when complete

## Documentation Requirements

**Must Update:**
- None required unless operator-facing degrade knobs need a short README note — list path in File Scope May change if added

**Check If Affected:**
- `docs/routing-roadmap.md`
- `README.md`

## Completion Criteria

- [ ] Neural/encoder failure → non-crashing sandwich with reason codes
- [ ] `route_path` telemetry present
- [ ] No prompt text in learned store
- [ ] #119 closable

## Git Commit Convention

- `feat(SP-212): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip encoder defaults or absolute release gates
- Implement #115 heat affinity or #117 prewarm
- Store raw prompts in learned memory
- Close #95 / #110 / #96

## Amendments

None.
