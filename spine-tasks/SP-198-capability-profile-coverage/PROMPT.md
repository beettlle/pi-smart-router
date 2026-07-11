# Task: SP-198 — Capability Profile Coverage (Dogfood Fleet)

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Document + measure fleet `benchmark` vs `pattern_default`; optional aliases for primary dogfood IDs.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#108
- Bucket: documentation
- Closes: #108
- Release: v0.10.0

## Mission

Closes #108 — Publish a dogfood-fleet coverage story for HyDRA capability priors: which scoped models resolve with `capability_source=benchmark` vs `pattern_default`, a measurable coverage metric, and either documented intentional gaps or aliases/rows so the primary dogfood fleet is grounded. Keep #75 closed (ingest/mapper already landed). Do **not** change shortfall τ or re-implement #75 core ingest.

## Dependencies

- **Task:** SP-196 (protocol path referenced from coverage docs)

## Context to Read First

- `src/config/pi-model-mapper.ts`
- `config/benchmark-profiles.json`
- `docs/qa/shadow-dogfood-protocol.md`
- `npm run routing:verify-benchmark-profiles` / `routing:ingest-benchmarks`
- GitHub #108; closed #75

## Environment

- **Workspace:** `docs/`, `src/config/`, `config/`, `scripts/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `docs/capability-profile-coverage.md`, `tests/unit/pi-model-mapper-coverage.test.ts` |
| May change | `config/benchmark-profiles.json`, `src/config/pi-model-mapper.ts`, `scripts/**`, `package.json`, `README.md` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper-coverage.test.ts` |
| fileScopeMustChange | `docs/capability-profile-coverage.md`, `tests/unit/pi-model-mapper-coverage.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Coverage doc + metric/test for dogfood fleet; gaps closed in writing or via aliases; #75 stays closed; #108 closable. |

## Steps

### Step 1: Coverage report + metric

- [ ] Define primary dogfood fleet ID list (align with protocol / common Cursor+pi IDs)
- [ ] Produce `docs/capability-profile-coverage.md` table: model → `benchmark` | `pattern_default` + rationale for intentional gaps
- [ ] Add unit test (or script+test) asserting coverage metric / expected sources for the fleet list
- [ ] Optionally add missing aliases/rows for primary fleet gaps (reuse existing ingest patterns)

### Step 2: Cross-links

- [ ] Link coverage doc from README or protocol (prefer README “May change” only if needed; prefer protocol cross-link)
- [ ] Confirm roadmap #108 pointer is accurate (SP-197 owns roadmap file — comment if mismatch)

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run routing:verify-benchmark-profiles` if profiles changed
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage
- [ ] Comment + close #108; ensure #75 stays closed

## Documentation Requirements

**Must Update:**
- `docs/capability-profile-coverage.md` *(also in File Scope)*

**Check If Affected:**
- `docs/qa/shadow-dogfood-protocol.md` — optional cross-link
- `README.md` — optional one-liner
- `docs/routing-roadmap.md` — owned by SP-197

## Completion Criteria

- [ ] Fleet coverage table documented
- [ ] Coverage metric/test present
- [ ] Gaps closed in writing or aliases
- [ ] #75 remains closed
- [ ] #108 closable

## Git Commit Convention

- `feat(SP-198): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Reopen or re-implement #75 core ingest/mapper
- Change shortfall τ without eval evidence
- Flip encoder defaults (#96)
- Edit `docs/routing-roadmap.md` (SP-197)

## Amendments

None.
