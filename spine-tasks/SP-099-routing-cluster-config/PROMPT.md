# Task: SP-099 — Routing cluster config schema and loader

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** Prerequisite for #58 — data-driven routing cluster catalog with YAML schema, Zod validation, and config loader.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#55
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Add a routing cluster catalog stored in config (not TypeScript keyword lists). Clusters group reference prompts by tier bias (`low_stakes_general`, `mechanical_edit`, `deep_debug`, `architecture`, etc.). Centroids computed offline at load time from reference prompt embeddings.

Deliver `config/routing-clusters.yaml.example`, Zod schema in `schemas.ts`, and loader in `src/config/routing-clusters-loader.ts`.

## Dependencies

- SP-095

## Context to Read First

- `src/domain/types/schemas.ts`, `entities.ts`
- `src/config/defaults.ts`
- `specs/001-build-smart-router/data-model.md`
- Epic: beettlle/pi-smart-router#54

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/schemas.ts` |
| May change | `src/domain/types/entities.ts`, `src/config/routing-clusters-loader.ts`, `config/routing-clusters.yaml.example`, `tests/unit/routing-clusters-loader.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/types/schemas.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | YAML schema validated via Zod; loader with example file; cluster IDs stable for reason codes; unit tests for schema and loader. |

## Steps

### Step 1: Schema and example config

- [ ] Define cluster config types in entities.ts
- [ ] Add Zod schema for clusters (id, tier_bias, reference_prompts, min_similarity, min_margin)
- [ ] Create `config/routing-clusters.yaml.example` with low_stakes_general, mechanical_edit, deep_debug, architecture clusters

### Step 2: Loader

- [ ] Implement `routing-clusters-loader.ts` with path from operator config
- [ ] Document example file in README
- [ ] Unit tests for valid/invalid YAML and loader edge cases

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] YAML schema validated via Zod
- [ ] Loader with example file documented in README
- [ ] Cluster IDs are stable reason-code prefixes (`cluster_low_stakes_general`)
- [ ] Operator can add/tune reference prompts without code changes
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-099): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)
- Implement embedding or matcher logic (SP-100, SP-101)

---
