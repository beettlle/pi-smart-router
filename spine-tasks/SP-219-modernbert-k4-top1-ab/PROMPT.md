# Task: SP-219 — K=4 Top-1 + Offline A/B + Enablement Writeup

**Created:** 2026-08-03
**Size:** M

## Review Level: 1

**Assessment:** Measure Top-1 vs 10% gate and offline A/B beyond fixture QR; write #96 recommendation; close #114 without flipping defaults.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#114
- Bucket: feature
- Closes: #114
- Soft parent: #96 (Partial — decision tracker remains open)
- Release: v0.16.0
- Manifest: `spine-tasks/_authoring/release-v0.16.0/manifest.md`

## Mission

Closes #114 — With SP-218 heads loadable (or documented operator-local path), measure Top-1 / shortfall error on verifier-grade packs (or a documented proxy) vs `MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD` (0.1). Run offline A/B `learned_projection` vs `modernbert_k4` using `scripts/eval/counterfactual-replay.ts` / SP-160 patterns — **not** fixture QR alone. Archive results under `.pi-smart-router/measurements/` (gitignored) and write a short decision artifact under `spine-tasks/_authoring/release-v0.16.0/` recommending keep default | opt-in dogfood | flip default. Comment on #96 with the artifact link. Explicit: soft ECE PASS does not by itself warrant K=4; **do not** flip `src/config/defaults.ts` without #96 operator approve (out of scope — evidence only).

## Dependencies

- **Task:** SP-218 (heads artifact or Partial path must exist so measurement can load or document blocker)

## Context to Read First

- GitHub #114 body (AC); parent #96
- `src/domain/matching/modernbert-heads.ts` — `MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD`
- `scripts/eval/counterfactual-replay.ts` — `compareK4HeadModeOfflineEval` / SP-160 patterns
- `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md`
- SP-218 STATUS / Partial if heads not checked in
- Manifest: `spine-tasks/_authoring/release-v0.16.0/manifest.md`
- Parent split: none (sibling of SP-218)

## Environment

- **Workspace:** `scripts/eval/`, `spine-tasks/_authoring/release-v0.16.0/`, measurement archive (gitignored)
- **Services required:** None (packs/ONNX optional — document if missing)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-top1-artifact.md` (create), `scripts/eval/counterfactual-replay.ts` (extend beyond fixture-only when needed) |
| May change | `package.json` (helper script only), `tests/unit/**` (Top-1 / A/B helpers), `README.md` (one-line link to artifact / #96), `scripts/eval/**` |
| Must NOT change | `src/config/defaults.ts`, `config/release-gates.json`, `config/modernbert-k4-heads.json` (SP-218 owns), `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/modernbert-heads.test.ts` |
| fileScopeMustChange | `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-top1-artifact.md` |
| fileScopeMustNotChange | `src/config/defaults.ts`, `config/release-gates.json` |
| completionCriteria | Decision writeup with Top-1 vs 0.1 gate + offline A/B beyond fixture-only (or explicit pack/proxy blockers); recommendation keep/opt-in/flip; linked from #96; defaults untouched; #114 closable; #96 left open. |

## Steps

### Step 1: Top-1 + offline A/B measurements

- [ ] Confirm SP-218 heads load (DEFAULT path) or record Partial / operator-local path from SP-218
- [ ] Define and compute Top-1 / shortfall error proxy vs `MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD` (0.1) on verifier-grade packs or documented proxy — never invent metrics
- [ ] Extend / run offline A/B beyond fixture QR (`compareK4HeadModeOfflineEval` / pack path); archive under `.pi-smart-router/measurements/`
- [ ] Explicit: soft ECE PASS alone does not warrant K=4

**Plan-review checkpoint** — Measurement sources and sample sizes recorded; fixture-only insufficient without documented proxy rationale.

### Step 2: Decision writeup + #96 link

- [ ] Write `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-top1-artifact.md` with recommendation: keep default | opt-in dogfood | flip default (or insufficient evidence)
- [ ] Confirm `src/config/defaults.ts` and `config/release-gates.json` unchanged (`git diff`)
- [ ] Comment on #96 with artifact link; close #114; do **not** close #96

### Step 3: Testing & Verification

- [ ] Confirm artifact exists with Top-1 table + A/B evidence or blockers + recommendation
- [ ] Run Contract `testCommand`
- [ ] Run related counterfactual / eval unit tests if touched
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% when application code changed (omit checkbox only if docs/artifact-only with no src/scripts test surface beyond typecheck)

## Documentation Requirements

**Must Update:**
- `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-top1-artifact.md` *(also in File Scope)*

**Check If Affected:**
- `README.md` — encoder / #96 section
- `docs/routing-roadmap.md` — Check If Affected only (status column)

## Completion Criteria

- [ ] Top-1 vs 0.1 measured or blocker documented
- [ ] Offline A/B beyond fixture-only (or documented proxy)
- [ ] Recommendation writeup; #96 commented; defaults not flipped
- [ ] #114 closable; #96 remains open

## Git Commit Convention

- `docs(SP-219): description` or `feat(SP-219): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip `modernbert_k4` / encoder defaults in `src/config/defaults.ts`
- Close #96 (product decision tracker)
- Invent Top-1 / QR numbers when packs or heads are missing
- Change absolute release-gate thresholds
- Overwrite SP-218 heads artifact without need

## Amendments

None.
