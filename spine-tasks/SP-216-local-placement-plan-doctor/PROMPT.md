# Task: SP-216 — Local Placement Plan / Doctor + Cold vs Warm TPS

**Created:** 2026-08-02
**Size:** M

## Review Level: 1

**Assessment:** Read-only operator plan/doctor report with cold vs warm TPS classification and quality-preserving resource policy (Colibri plan/doctor analog).
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#116
- Bucket: feature
- Closes: #116
- Release: v0.15.0
- Manifest: `spine-tasks/_authoring/release-v0.15.0/manifest.md`

## Mission

Closes #116 — Ship an honest **local placement plan/doctor** operator surface (e.g. `/smart-router plan` and/or `doctor`) that reports encoder resident status, local model warm/cold, RAM/disk constraints, and bottleneck guess — **read-only**, no route mutation. Extend throughput semantics so local viability distinguishes **cold vs warm** samples (document formula; fail closed when only cold samples exist if policy says so). Document quality-preserving policy: under resource pressure prefer “local unavailable / escalate safely” over silently weakening encoder fidelity. JSON-stable report shape for automation. Builds on #84 / SP-163–164; do not merge hardware dogfood scopes (#1/#25/#26). No FrugalGPT cascades; no absolute release-gate edits.

## Dependencies

- **None**

## Context to Read First

- GitHub #116 body (AC)
- `src/infrastructure/hardware/throughput-meter.ts` — extend cold/warm classification
- `src/infrastructure/hardware/hardware-probe.ts` — placement inputs
- `.pi/extensions/smart-router/commands.ts` / `command-formatters.ts` — operator surface
- SP-164 local_zero TPS gate patterns
- Manifest: `spine-tasks/_authoring/release-v0.15.0/manifest.md`

## Environment

- **Workspace:** `src/infrastructure/hardware/`, `.pi/extensions/smart-router/`, `tests/`, `README.md`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/hardware/placement-plan.ts` (create), `src/infrastructure/hardware/throughput-meter.ts`, `.pi/extensions/smart-router/commands.ts`, `.pi/extensions/smart-router/command-formatters.ts`, `tests/unit/placement-plan.test.ts` (create), `README.md` |
| May change | `src/infrastructure/hardware/hardware-probe.ts`, `src/cli/smart-router-cli.ts`, `.pi/extensions/smart-router/index.ts` (command registration only), `src/domain/types/**`, `tests/unit/**`, `docs/**` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/routing/expected-cost.ts`, `src/domain/routing/workload-heat.ts`, `src/domain/pinning/**`, `config/release-gates.json`, encoder defaults |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/placement-plan.test.ts` |
| fileScopeMustChange | `src/infrastructure/hardware/placement-plan.ts`, `src/infrastructure/hardware/throughput-meter.ts`, `.pi/extensions/smart-router/commands.ts`, `tests/unit/placement-plan.test.ts`, `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `src/domain/routing/expected-cost.ts`, `config/release-gates.json` |
| completionCriteria | Read-only plan/doctor report (JSON-stable); cold vs warm TPS; quality-preserving policy documented; unit tests; README ops docs; #116 closable. |

## Steps

### Step 1: Placement report + cold/warm TPS

- [ ] Placement plan module: encoder resident, local warm/cold, RAM/disk, bottleneck guess — read-only
- [ ] Cold vs warm TPS classification in throughput meter (document formula; fail-closed policy when only cold)
- [ ] JSON-stable report shape for automation
- [ ] Unit tests for schema + cold/warm classification

**Plan-review checkpoint** — Confirm report never mutates route / pin / gates.

### Step 2: Operator commands + README policy

- [ ] `/smart-router plan` and/or `doctor` extension path
- [ ] Document quality-preserving policy under resource pressure
- [ ] README operator docs for plan/doctor

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related hardware / command unit tests if touched
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #116 and close when complete

## Documentation Requirements

**Must Update:**
- `README.md` — plan/doctor + cold/warm TPS + quality policy (also in File Scope)

**Check If Affected:**
- `docs/routing-roadmap.md`

## Completion Criteria

- [ ] Read-only plan/doctor with JSON-stable shape
- [ ] Cold vs warm TPS semantics documented and tested
- [ ] Quality-preserving policy documented
- [ ] #116 closable

## Git Commit Convention

- `feat(SP-216): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Mutate routes from plan/doctor (read-only only)
- Edit `router-pipeline.ts`, `expected-cost.ts`, heat/pinning modules (SP-215/SP-217)
- Flip encoder defaults or absolute release gates
- Merge #1/#25/#26 hardware dogfood scopes
- Close #95 / #110 / #115 / #117

## Amendments

None.
