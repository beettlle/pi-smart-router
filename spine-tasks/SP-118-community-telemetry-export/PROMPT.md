# Task: SP-118 — Community telemetry contribution export

**Created:** 2026-07-07
**Size:** S

## Review Level: 1

**Assessment:** #67 — privacy-safe telemetry export format and contribution workflow for community calibration.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#67
- Bucket: feature
- Epic: beettlle/pi-smart-router#63

## Mission

Add `pi-smart-router export telemetry-contrib` CLI command producing schema-valid JSON with only privacy-safe scalar features from dataset + outcomes (no prompt text, no messages). Add `specs/001-build-smart-router/contracts/telemetry-contrib.schema.json`. Document contribution workflow in README (GitHub Discussion template or PR-based `data/contrib/`). Add synthetic `data/contrib/example.json`. Validation on ingest rejects tainted payloads (reuse SP-116 validator).

## Dependencies

- SP-116
- SP-060

## Context to Read First

- `src/cli/smart-router-cli.ts`
- `scripts/calibration-aggregate.ts` (SP-116)
- `specs/001-build-smart-router/contracts/telemetry-contrib.schema.json` (create)
- `README.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/cli/smart-router-cli.ts` |
| May change | `specs/001-build-smart-router/contracts/telemetry-contrib.schema.json`, `data/contrib/example.json`, `README.md`, `tests/unit/smart-router-cli.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/cli/smart-router-cli.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Export produces schema-valid JSON with zero prompt content; README documents workflow; validation rejects tainted payloads; example contrib file present. |

## Steps

### Step 1: Export command and schema

- [ ] Define `telemetry-contrib.schema.json`
- [ ] Implement `export telemetry-contrib` subcommand with privacy-safe field filter
- [ ] Strip `dataset_key` / install-local pepper fields

### Step 2: Contribution workflow docs

- [ ] Document contribution path in README
- [ ] Add synthetic `data/contrib/example.json`
- [ ] Wire validation to reject prompt/message pattern keys

### Step 3: Testing and verification

- [ ] Unit tests: export output schema-valid; tainted sample rejected
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Export produces schema-valid JSON with zero prompt content
- [ ] README documents contribution workflow
- [ ] Validation script rejects tainted payloads
- [ ] Example contrib file in `data/contrib/example.json` (synthetic)
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-118): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
