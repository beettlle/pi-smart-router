# Task: SP-092 — ModelProfile context limits and LiteLLM ingest

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** Add max_input_tokens to ModelProfile and ingest from LiteLLM registry.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#48
- Bucket: feature

## Mission

The router cannot answer "does this model fit the current session?" because `ModelProfile` has no context window fields. LiteLLM pricing JSON includes `max_input_tokens` / `max_tokens`, but `litellm-fetch.ts` extracts only cost rates.

1. Extend `ModelProfile` with optional `limits.max_input_tokens` and `limits.max_output_tokens` (domain, schema, YAML example).
2. Extend LiteLLM normalize path to parse context limits into price cache sidecar.
3. Fleet bootstrap merges resolved limits: YAML override → registry → conservative default via `pi-model-mapper.ts`.

## Dependencies

- SP-090

## Context to Read First

- `src/domain/types/entities.ts`, `schemas.ts`
- `src/infrastructure/pricing/litellm-fetch.ts`
- `src/infrastructure/pricing/price-broker.ts`
- `src/config/pi-model-mapper.ts`
- `config/models.yaml.example`
- Epic: beettlle/pi-smart-router#46

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/entities.ts`, `src/infrastructure/pricing/litellm-fetch.ts` |
| May change | `src/domain/types/schemas.ts`, `src/infrastructure/pricing/price-broker.ts`, `src/config/pi-model-mapper.ts`, `config/models.yaml.example` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/types/entities.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | ModelProfile exposes limits; LiteLLM refresh populates context limits; YAML documents fields; unit tests for merge precedence. |

## Steps

### Step 1: Extend ModelProfile and schema

- [ ] Add `limits` block to entities, schemas, and `models.yaml.example`

### Step 2: LiteLLM ingest and merge

- [ ] Parse max_input_tokens / max_output_tokens in litellm-fetch
- [ ] Resolve limits in price-broker or limits module (YAML > registry > default)
- [ ] Merge limits onto fleet ModelProfile at bootstrap

### Step 3: Testing and verification

- [ ] Unit tests for normalize + merge precedence
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `ModelProfile` exposes `limits.max_input_tokens` (populated for cloud fleet)
- [ ] LiteLLM refresh populates context limits for major chat models
- [ ] Unit tests for normalize + merge precedence (YAML > registry > default)
- [ ] `models.yaml.example` documents the new fields
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-092): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
