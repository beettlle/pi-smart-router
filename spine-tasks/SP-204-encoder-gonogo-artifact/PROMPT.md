# Task: SP-204 — Encoder Holdout ECE + Latency Go/No-Go Artifact

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Run existing measurement scripts; produce #96 go/no-go writeup; no default flips.
**Score:** 2/8 — Blast radius: 0, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#113
- Bucket: feature
- Closes: #113
- Soft parent: #96 (decision tracker — do not close #96)
- Release: v0.11.0

## Mission

Closes #113 — Run pack holdout ECE / calibration dry-run and encoder latency benchmarks for candidate configs (MiniLM vs Granite; K=4 heads if artifacts available). Produce a decision writeup operators can approve for #96: keep minilm defaults, promote granite, and/or enable modernbert_k4. Link writeup from #96. Do **not** flip `src/config/defaults.ts` unless #96 AC + operator approve are already satisfied (they are not — this task is evidence only). Document missing ONNX weights / config blockers instead of inventing metrics.

## Dependencies

- **None**

## Context to Read First

- `scripts/benchmark-encoder-latency.ts`
- `scripts/verify-routing-calibration.ts` — dry-run packs / holdout ECE
- `src/config/defaults.ts` (read-only)
- `tests/eval/corpus/label-packs/PROVENANCE.md`
- GitHub #113; parent #96; draft `spine-tasks/_authoring/issues/issue-96-update.md` if present

## Environment

- **Workspace:** `spine-tasks/_authoring/release-v0.11.0/`, measurement scripts (run, prefer not edit)
- **Services required:** None (ONNX weights optional — document if missing)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md` |
| May change | `package.json` (optional helper script only), `README.md` (one-line link to artifact / #96) |
| Must NOT change | `src/config/defaults.ts`, `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `scripts/eval/community-bench.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `true` |
| fileScopeMustChange | `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md` |
| fileScopeMustNotChange | `src/config/defaults.ts`, `config/release-gates.json` |
| completionCriteria | Decision writeup with archived measurement outputs or explicit blockers; clear recommendation; linked from #96; defaults untouched; #113 closable. |

## Steps

### Step 1: Run measurements (or document blockers)

- [ ] Run `npm run routing:calibration-dry-run` (or documented pack holdout ECE path); archive output under `.pi-smart-router/` or quote key tables in the artifact
- [ ] Run `npm run benchmark:encoder` for candidate encoder configs; record p50/p95 vs budget when weights exist
- [ ] If K=4 heads artifacts/config available, measure Top-1 / ECE impact vs learned_projection; else document blocker
- [ ] Note any missing ONNX weights / config files that block measurement

### Step 2: Decision writeup + #96 link

- [ ] Write `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md` with recommendation: keep minilm / promote granite / enable modernbert_k4 (or “insufficient evidence”)
- [ ] Explicit: do **not** flip `src/config/defaults.ts` in this task
- [ ] Comment on #96 with link to artifact; close #113

### Step 3: Testing & Verification

- [ ] Confirm artifact path exists and contains recommendation + evidence or blockers
- [ ] Confirm `src/config/defaults.ts` and `config/release-gates.json` unchanged (`git diff`)
- [ ] Run `npm run verify:ci` (full suite — docs/artifact task still runs suite)
- [ ] Comment + close #113; do **not** close #96

## Documentation Requirements

**Must Update:**
- `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md` *(also in File Scope)*

**Check If Affected:**
- `README.md` — encoder / #96 section
- `tests/eval/corpus/label-packs/PROVENANCE.md`

## Completion Criteria

- [ ] Measurements archived or blockers documented
- [ ] Go/no-go writeup with clear recommendation
- [ ] Linked from #96; defaults not flipped
- [ ] #113 closable; #96 remains open for operator enablement

## Git Commit Convention

- `docs(SP-204): description` or `feat(SP-204): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip `modernbert_k4` / granite defaults in `src/config/defaults.ts`
- Close #96 (product decision tracker)
- Invent ECE / latency numbers when scripts or weights fail
- Change absolute release-gate thresholds

## Amendments

None.
