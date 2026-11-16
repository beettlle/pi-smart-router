# Task: SP-318 — cover gemini-4-carbon and gemini-4-hydrogen

**Created:** 2026-11-15
**Size:** S

## Review Level: 1

**Assessment:** Fleet coverage lag — Gemini 4+ pattern already frontiers carbon/hydrogen, but aliases, tests, and ungrounded provenance still name argon only.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#200
- Release: v1.4.0
- Bucket: feature
- Closes: #200

## Mission

Closes #200 — Explicit fleet coverage for `gemini-4-carbon` and `gemini-4-hydrogen`:

1. Confirm mapper tiers both ids (and `google/…`) as frontier via the existing Gemini 4+ rule from SP-310 — no new pattern family unless ids deviate (flash/lite).
2. Add fleet aliases and `ungrounded_fleet_ids` (or grounded rows when leaderboard scores exist) for carbon/hydrogen, mirroring argon.
3. Add unit tests for the new ids (mapper + ingest/alias expectations).
4. Optional: refresh ingest when public scores appear; keep `pattern_default` until then.

Serialize after SP-316 so both do not race on `config/benchmark-profiles.json`.

## Dependencies

- SP-316

## Context to Read First

- `src/config/pi-model-mapper.ts` (Gemini 4+ rule)
- `config/benchmark-profiles.json` (`aliases`, `provenance.ungrounded_fleet_ids`)
- `tests/unit/pi-model-mapper.test.ts`, `tests/unit/ingest-benchmark-profiles.test.ts`
- Issue beettlle/pi-smart-router#200

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/benchmark-profiles.json`, `tests/unit/pi-model-mapper.test.ts` |
| May change | `scripts/ingest-benchmark-profiles.ts` (DEFAULT aliases / ungrounded seeds), `tests/unit/ingest-benchmark-profiles.test.ts`, `tests/unit/pi-model-mapper-coverage.test.ts` |
| Must NOT change | `package.json`, `src/domain/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-coverage.test.ts tests/unit/ingest-benchmark-profiles.test.ts && npm run routing:verify-benchmark-profiles && bash scripts/spine-stet-contract-run.sh default SP-318` |
| fileScopeMustChange | `tests/unit/pi-model-mapper.test.ts`, `tests/unit/ingest-benchmark-profiles.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/domain/`, `.review/` |
| completionCriteria | carbon/hydrogen frontier via existing rule; aliases + ungrounded (or grounded) parity with argon; tests green |

## Steps

### Step 0: Preflight

- [ ] Confirm mapper already frontiers carbon/hydrogen; note argon alias/ungrounded pattern to mirror

### Step 1: Aliases / provenance / tests

- [ ] Add aliases + ungrounded (or grounded) entries; mapper + ingest tests

### Step 2: Testing & Verification

- [ ] Run Contract `testCommand`

## Amendments (2026-11-16)

- `config/benchmark-profiles.json` was already refreshed on main (SP-317/SP-316). Keep it in Must change; contract `fileScopeMustChange` also requires `tests/unit/pi-model-mapper.test.ts` (and may update ingest defaults). Pre-landed artifact edits are expected — extend aliases/ungrounded for carbon/hydrogen rather than treating the file as virgin.

## Do NOT

- Invent leaderboard scores
- Add a redundant Gemini pattern rule unless ids fail the existing rule

## Completion Criteria

- [ ] #200 closed
- [ ] Contract green
