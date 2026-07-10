# Task: SP-174 — Fleet Capability Profiles

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Ground HyDRA capability vectors for common scoped-fleet model IDs so shortfall matching is not pattern-default-only.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#94
- Bucket: feature
- Closes: #94

## Mission

Benchmark-grounded capability ingest landed (#75), but live scoped-fleet model IDs from the pi registry often miss `config/benchmark-profiles.json` rows and fall through to regex/pattern defaults in `mapPiModelToProfile`. Expand coverage (rows and/or alias map) for Cursor / Gemini / Anthropic / OpenAI IDs commonly selected in dogfood so capabilities resolve from benchmark-backed data. Document how to add a new fleet ID after `npm run routing:ingest-benchmarks`. Expose whether capabilities came from benchmark vs pattern default (telemetry or explain). Add unit/integration coverage that at least one real scoped-fleet ID is not pattern-default-only.

## Dependencies

- **None**

## Context to Read First

- `src/config/pi-model-mapper.ts` — `mapPiModelToProfile`, `withBenchmarkCapabilities`
- `config/benchmark-profiles.json` — checked-in ingest artifact
- `scripts/ingest-benchmark-profiles.ts`
- `tests/unit/pi-model-mapper.test.ts`, `tests/unit/ingest-benchmark-profiles.test.ts`
- README benchmark-profile / ingest sections

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts`, `config/benchmark-profiles.json` |
| May change | `scripts/ingest-benchmark-profiles.ts`, `tests/fixtures/benchmark-leaderboards/**`, `tests/unit/pi-model-mapper.test.ts`, `tests/unit/ingest-benchmark-profiles.test.ts`, `README.md` |
| Must NOT change | `.pi/extensions/smart-router/**`, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/ingest-benchmark-profiles.test.ts` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts`, `config/benchmark-profiles.json` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/**` |
| completionCriteria | Common scoped-fleet IDs resolve benchmark-backed capabilities; add-ID docs exist; at least one real fleet ID is not pattern-default-only in tests; capability source visible in telemetry or explain. |

## Steps

### Step 1: Alias map and profile coverage

- [ ] Add alias map and/or expand `config/benchmark-profiles.json` so common Cursor / Gemini / Anthropic / OpenAI scoped-fleet IDs resolve benchmark-backed capabilities
- [ ] Keep ingest path coherent (`routing:ingest-benchmarks` / verify still pass when fixtures change)
- [ ] Prefer alias → existing `model_id` over inventing ungrounded scores

### Step 2: Source signal + tests + docs

- [ ] Surface capability source (benchmark vs pattern default) via explain/telemetry or profile metadata already used by dogfood logs
- [ ] Unit/integration: at least one real scoped-fleet ID is not pattern-default-only
- [ ] Document how to add a new fleet ID after `npm run routing:ingest-benchmarks`

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/ingest-benchmark-profiles.test.ts`
- [ ] Run `npm run routing:verify-benchmark-profiles` if fixtures/artifact changed
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Common dogfood scoped-fleet IDs resolve benchmark-backed rows (or documented aliases)
- [ ] Add-new-fleet-ID docs present
- [ ] Test proves at least one real scoped-fleet ID is not pattern-default-only
- [ ] Capability source (benchmark vs pattern) visible to operators

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Must Update | `README.md` (benchmark profiles / ingest / alias guidance) |

## Git Commit Convention

- `feat(SP-174): description`

## Do NOT

- Invent capability scores without benchmark/fixture provenance
- Modify extension SAAR wiring (#92 / SP-173)
- Ship P(success) weights (#93 / SP-175)
- Change `router-pipeline.ts` shortfall math

---

## Amendments (Added During Execution)

- **2026-07-10:** May change `tests/integration/pi-extension.test.ts` — update SP-136 assertions for fleet aliases (claude-3.5-sonnet now resolves via alias to grounded sonnet-4-6 scores).
