# Task: SP-176 — Triage Repo-Cleanup Tier

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Add deterministic triage/turn-envelope signals so agentic repo-hygiene prompts are not classified as zero-tier.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#97
- Bucket: bug
- Closes: #97

## Mission

Conversational but agentic prompts (repo cleanup / accidental-add cleanup) score as low-intensity and exit at `local_zero` before HyDRA. Deterministic triage has no cleanup/destructive keywords; turn envelope stays `main_loop`. Add deterministic signals (triage and/or turn-envelope) so repo-hygiene / destructive-intent phrases resolve to at least economical-cloud (never zero-tier on turn 1 with local ready). Keep true trivial prompts (format/lint) eligible for local. Add an eval/unit fixture for “help me clean up mistakenly added files in the repo”.

## Dependencies

- **None**

## Context to Read First

- `src/domain/triage/triage-engine.ts` — `COMPLEX_KEYWORDS`, intensity / tier mapping
- `src/domain/triage/turn-envelope.ts` — envelope patterns
- `src/domain/pipeline/router-pipeline.ts` — stage order; `resolveLocalEligible` / `localZeroTierStage` (read-only unless a tiny eligibility hook is required)
- `tests/unit/triage-engine.test.ts`, `tests/unit/turn-envelope.test.ts`, `tests/unit/local-zero-tier.test.ts`
- GitHub #97 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/triage/triage-engine.ts`, `src/domain/triage/turn-envelope.ts` |
| May change | `tests/unit/triage-engine.test.ts`, `tests/unit/turn-envelope.test.ts`, `tests/unit/local-zero-tier.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/**`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/triage-engine.test.ts tests/unit/turn-envelope.test.ts tests/unit/local-zero-tier.test.ts` |
| fileScopeMustChange | `src/domain/triage/triage-engine.ts`, `src/domain/triage/turn-envelope.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/**` |
| completionCriteria | Repo-hygiene / destructive-intent prompts classify ≥ economical-cloud; fixture never zero-tier on turn 1 with local ready; trivial format/lint still local-eligible; unit coverage for fixture path. |

## Steps

### Step 1: Deterministic cleanup / destructive signals

- [ ] Extend triage and/or turn-envelope so repo-hygiene / destructive-intent phrases are at least economical-cloud (not zero-tier)
- [ ] Prefer keyword/pattern sets consistent with existing `COMPLEX_KEYWORDS` / envelope style
- [ ] Do not change `router-pipeline.ts` in this task

### Step 2: Fixture + regression tests

- [ ] Fixture: “help me clean up mistakenly added files in the repo” → tier ≥ `economical-cloud`, never `zero-tier` on turn 1 with local ready
- [ ] Regression: true trivial prompts (format/lint) still eligible for local when appropriate
- [ ] Cover triage and/or turn-envelope unit paths; pipeline/local-zero tests only if needed without editing pipeline source

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/triage-engine.test.ts tests/unit/turn-envelope.test.ts tests/unit/local-zero-tier.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Deterministic signals treat repo-hygiene / destructive-intent as ≥ economical-cloud
- [ ] Eval/unit fixture for cleanup prompt never routes zero-tier on turn 1 with local ready
- [ ] Trivial format/lint prompts remain local-eligible when appropriate
- [ ] Unit/integration coverage for the fixture path

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Check If Affected | `README.md` (only if triage keyword docs exist) |

## Git Commit Convention

- `fix(SP-176): description`

## Do NOT

- Implement pre-`local_zero` tool_use capability gate (#98 / SP-177)
- Implement SAAR pin-break or history model-id fixes (#99 / SP-178)
- Edit `router-pipeline.ts` or pinning modules
- Weaken true trivial local eligibility

---

## Amendments (Added During Execution)
