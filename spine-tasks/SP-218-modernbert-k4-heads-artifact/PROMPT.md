# Task: SP-218 — Train / Ship ModernBERT K=4 Heads Artifact

**Created:** 2026-08-03
**Size:** M

## Review Level: 1

**Assessment:** Produce loadable `config/modernbert-k4-heads.json` (or document operator-local) so Top-1 / A/B measurement can run; no default flip.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#114
- Bucket: feature
- Partial: #114 (heads deliverable; measurement in SP-219)
- Soft parent: #96 (decision tracker — do not close)
- Release: v0.16.0
- Manifest: `spine-tasks/_authoring/release-v0.16.0/manifest.md`

## Mission

Partial #114 — Produce trained `config/modernbert-k4-heads.json` loadable via `DEFAULT_MODERNBERT_K4_HEADS_PATH` (`src/domain/matching/modernbert-heads.ts`), **or** document why heads remain operator-local with a clear provenance/blocker writeup under the release authoring folder. Add a thin train/export path from existing privacy-safe label packs / calibration features when feasible (no raw prompts). Verify `loadModernBertK4HeadWeights()` returns non-null for the shipped path. Do **not** flip `src/config/defaults.ts` or absolute `config/release-gates.json`. Soft ECE PASS alone does not ship this artifact — train from real pack/features or document the blocker honestly.

## Dependencies

- **None**

## Context to Read First

- GitHub #114 body (AC)
- `src/domain/matching/modernbert-heads.ts` — schema, `DEFAULT_MODERNBERT_K4_HEADS_PATH`, loader
- `tests/unit/modernbert-heads.test.ts`
- `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md` — prior blocker
- `tests/eval/corpus/label-packs/PROVENANCE.md`
- Manifest: `spine-tasks/_authoring/release-v0.16.0/manifest.md`
- Parent split: none (sibling of SP-219)

## Environment

- **Workspace:** `config/`, `scripts/`, `src/domain/matching/`, `tests/`
- **Services required:** None (ONNX / pack data optional — document if missing)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | Path (A): `config/modernbert-k4-heads.json` (create) **and** a train script under `scripts/` (e.g. `scripts/train-modernbert-k4-heads.ts`) **and** `package.json` script alias. Path (B) if floors unmet: `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md` documenting why heads remain operator-local |
| May change | `tests/unit/modernbert-heads.test.ts`, `src/domain/matching/modernbert-heads.ts` (loader/helpers only), `README.md` (one-line pointer), `tests/eval/corpus/label-packs/PROVENANCE.md` |
| Must NOT change | `src/config/defaults.ts`, `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts`, `scripts/eval/counterfactual-replay.ts` (SP-219) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/modernbert-heads.test.ts` |
| fileScopeMustChange | Path (A): `config/modernbert-k4-heads.json`. Path (B): `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md` |
| fileScopeMustNotChange | `src/config/defaults.ts`, `config/release-gates.json`, `scripts/eval/counterfactual-replay.ts` |
| completionCriteria | Either (A) checked-in heads artifact loads via DEFAULT path + train script + unit coverage; or (B) Partial writeup with honest blocker and no invented weights. Defaults untouched. |

## Steps

### Step 1: Train path + artifact or Partial

- [ ] Inspect label packs / privacy-safe features available for K=4 head training (no raw prompts)
- [ ] Implement thin train/export script writing `ModernBertK4HeadWeightsSchema`-valid JSON, **or** write Partial documenting why heads remain operator-local
- [ ] If shipping: write `config/modernbert-k4-heads.json` with provenance metadata in adjacent docs/README comment or Partial companion note
- [ ] Add `package.json` script alias (e.g. `routing:train-modernbert-k4`) when train path exists

**Plan-review checkpoint** — Confirm no invented weights; schema matches loader; defaults not flipped.

### Step 2: Loader verification + tests

- [ ] Verify `loadModernBertK4HeadWeights()` returns non-null for shipped DEFAULT path (or Partial documents null + operator-local path)
- [ ] Extend `tests/unit/modernbert-heads.test.ts` for load/shipped artifact (fixture or temp file OK if Partial)
- [ ] Explicit: do not edit `src/config/defaults.ts`

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage on touched code
- [ ] Comment on #114 that heads deliverable is landed (or Partial); do **not** close #114 (SP-219 closes) or #96

## Documentation Requirements

**Must Update:**
- Path (A): train script header / README one-liner for artifact **or** Path (B): `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md` *(also in File Scope)*

**Check If Affected:**
- `tests/eval/corpus/label-packs/PROVENANCE.md`
- `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md` (historical — do not rewrite unless clarifying pointer)

## Completion Criteria

- [ ] Heads artifact loadable at DEFAULT path **or** Partial documents operator-local blocker
- [ ] Train script or honest no-train rationale
- [ ] Unit tests green; defaults / release-gates untouched
- [ ] #114 left open for SP-219; #96 not closed

## Git Commit Convention

- `feat(SP-218): description` or `docs(SP-218): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip `modernbert_k4` / encoder defaults in `src/config/defaults.ts`
- Edit absolute `config/release-gates.json`
- Invent head weights when training data is insufficient
- Close #114 or #96
- Edit `scripts/eval/counterfactual-replay.ts` (SP-219 owns measurement)

## Amendments

None.
