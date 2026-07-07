# Task: SP-114 — Offline routing centroid bootstrap script

**Created:** 2026-07-07
**Size:** M

## Review Level: 1

**Assessment:** #64 — offline script to precompute 384-dim cluster centroids from routing catalog reference prompts.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#64
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Add `scripts/bootstrap-routing-centroids.ts` and `npm run routing:bootstrap-centroids` CLI. Load cluster catalog (#55), embed each reference prompt via HyDRA MiniLM pipeline, mean-pool to centroid vectors, serialize to `config/routing-centroids.json` with `{ cluster_id, tier_bias, centroid, reference_count }`. Add `config/routing-centroids.json.example`. Ensure cluster matcher loads centroids at startup. Document regeneration in README operator section.

## Dependencies

- SP-099
- SP-101

## Context to Read First

- `config/routing-clusters.yaml` (or equivalent from SP-099)
- `src/domain/matching/cluster-matcher.ts`
- `src/domain/matching/hydra-matcher.ts` — embedder reuse
- `package.json`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/bootstrap-routing-centroids.ts` |
| May change | `config/routing-centroids.json.example`, `package.json`, `src/domain/matching/cluster-matcher.ts`, `tests/unit/cluster-matcher.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/bootstrap-routing-centroids.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Script runs offline; output validates against catalog IDs; matcher loads centroids; snapshot unit test; README documented. |

## Steps

### Step 1: Bootstrap script

- [ ] Implement `bootstrap-routing-centroids.ts` with catalog load, embed, mean-pool, serialize
- [ ] Add `npm run routing:bootstrap-centroids` to package.json
- [ ] Create `config/routing-centroids.json.example`

### Step 2: Cluster matcher integration

- [ ] Load centroids artifact at cluster matcher startup
- [ ] Fallback when artifact missing (existing inline behavior)
- [ ] Validate output cluster IDs match catalog

### Step 3: Testing and verification

- [ ] Unit test: known reference prompts → stable centroid (snapshot tolerance)
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Script runs offline without pi session
- [ ] Output validates against cluster catalog cluster IDs
- [ ] Cluster matcher (#56) loads centroids at startup
- [ ] Unit test: known reference prompts → stable centroid (snapshot tolerance)
- [ ] Document in README operator section
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-114): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
