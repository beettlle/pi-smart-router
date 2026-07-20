# Task: SP-210 — Economical Pin Break on Hard Agentic Failure

**Created:** 2026-07-19
**Size:** M

## Review Level: 1

**Assessment:** Break/upgrade stuck economical-cloud pins when hard multi-step / tool-failure paths need recovery; preserve healthy economical pins.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#122
- Bucket: bug
- Closes: #122
- Release: v0.13.0
- Manifest: `spine-tasks/_authoring/release-v0.13.0/manifest.md`

## Mission

Closes #122 — After a session pins an economical-cloud model, hard multi-step / tool-failure sessions must not stay stuck on that pin when quality recovery needs a higher tier. Document break/upgrade conditions for wrong-tier or repeated tool failure while pinned economical. History must show pin-break reason and new selected model when escalation fires. Fixture: economical pin + N tool failures / quality proxies → leaves pure `session_pinned` or selects frontier when in fleet. Non-regression: healthy economical pin on trivial / tool-success sessions still holds. Cite gaps vs closed #98 / #99 if still open behaviorally.

## Dependencies

- **None**

## Context to Read First

- GitHub #122 body (AC)
- `src/domain/pinning/session-pinner.ts` — breakPin / break rules
- SAAR / loop-escalation predecessors (closed #98, #99) — verify remaining gaps
- `src/domain/pipeline/router-pipeline.ts` — only if loop_escalation stage must call breakPin (prefer pinning module)
- Explain / history surfaces for pin-break reason

## Environment

- **Workspace:** `src/domain/pinning/`, `tests/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pinning/session-pinner.ts`, `tests/unit/economical-pin-break-agentic.test.ts` (create) |
| May change | `src/domain/pinning/**`, loop-escalation module under `src/domain/**`, `src/api/explain/**`, `tests/unit/**`, `tests/integration/**`, `docs/**` (break-condition note only) |
| Must NOT change | `config/release-gates.json`, encoder defaults, `src/config/pi-model-mapper.ts`, `docs/capability-profile-coverage.md` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/economical-pin-break-agentic.test.ts` |
| fileScopeMustChange | `src/domain/pinning/session-pinner.ts`, `tests/unit/economical-pin-break-agentic.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `docs/capability-profile-coverage.md` |
| completionCriteria | Documented break/upgrade conditions; history shows break reason + new model; fixture leaves stuck economical pin on hard agentic failure; healthy economical pin non-regression; #122 closable. |

## Steps

### Step 1: Break/upgrade rules for hard agentic failure

- [ ] Identify remaining gap vs closed #98/#99 for economical pin + repeated tool / quality failure
- [ ] Implement break/upgrade so session leaves pure `session_pinned` economical when conditions met (frontier when in fleet)
- [ ] Surface pin-break reason in history / explain
- [ ] Document conditions (code comment + brief docs note if operator-facing)

**Plan-review checkpoint** — Confirm SAAR cache wins do not silently block recovery forever.

### Step 2: Non-regression fixtures

- [ ] Fixture: economical pin + N tool failures / proxies → break/upgrade
- [ ] Fixture: trivial / tool-success economical pin still holds
- [ ] Do not change force_model_id semantics (SP-209)

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related pinning / loop-escalation unit tests if touched
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #122 and close when complete

## Documentation Requirements

**Must Update:**
- None required unless break conditions need an operator-facing note — then add a short section under an existing pinning/SAAR doc already in May change

**Check If Affected:**
- `docs/qa/shadow-dogfood-protocol.md`
- `README.md`

## Completion Criteria

- [ ] Break/upgrade conditions documented and implemented
- [ ] History shows break reason + new model when escalation fires
- [ ] Hard-failure fixture green
- [ ] Healthy economical pin non-regression green
- [ ] #122 closable

## Git Commit Convention

- `fix(SP-210): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip encoder defaults or absolute release gates
- Rewrite force/prefer path owned by SP-209
- Implement local_zero preference (SP-211)
- Close #95 / #110

## Amendments

None.
