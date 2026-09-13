# Granite opt-in dogfood runbook — SP-295 note (#167)

**Date:** 2026-09-13
**Release:** v1.2.0
**Task:** SP-295
**Issue:** [#167](https://github.com/beettlle/pi-smart-router/issues/167) — opt-in Granite encoder dogfood (fetch, switch, post-switch follow-ups)

## What landed

- **README runbook** — new section `HyDRA model cache → Granite opt-in dogfood runbook (#167)` covering:
  1. **Fetch** — `GRANITE_ONNX_MODEL` = `onnx-community/granite-embedding-97m-multilingual-r2-ONNX`; on-demand download into `hydra.artifact_cache_path` (default `.pi-smart-router/models/`) on first embed or `npm run benchmark:encoder`.
  2. **Switch** — operator config `hydra.encoder: granite`, keeping `hydra_heads: learned_projection` (384-dim SP-115 compatible).
  3. **Verify** — `/smart-router plan` / `/smart-router doctor` residency check; no silent MiniLM fallback (fail-open is surfaced, #119/#148).
  4. **Measure + archive** — `npm run benchmark:encoder` archived under `.pi-smart-router/measurements/` (gitignored); expectation ≤120 ms p50/p95 (SP-204 baseline ~17 ms p50).
  5. **Post-switch follow-ups** — latency watch, centroid/cluster-space refresh question, projection/calibration ECE re-check, truncation signal, fail-open path, **feed #96** (evidence only; no default flip), ModernBERT K=4 stays out of scope.
- **`config/operator-config.json.example`** — comment-only `_encoder_documentation` key next to `encoder` pointing at the runbook; the example value stays `minilm`.

## Defaults untouched

- `src/config/defaults.ts` / `DEFAULT_ENCODER` remain `minilm` (verified; not edited).
- No `modernbert_k4` enablement; no `config/release-gates.json` edits; no embedder reimplementation (#80).

## Close vs Partial for #167

**Partial** — the runbook (autonomous AC) is complete, but the issue's dogfood acceptance criteria require human/operator action:

- [ ] `encoder: granite` set on at least one dogfood install (human)
- [ ] Granite ONNX artifact present in cache (downloads on first dogfood run; absent in this worktree — MiniLM only)
- [ ] `npm run benchmark:encoder` p50/p95 archived from the dogfood host
- [ ] Smoke: routing still selects; no silent MiniLM fallback
- [ ] Measurements archived + summary comment on #167
- [ ] Results cross-linked on #96 (evidence only; no default flip)

Recommendation: keep #167 open as **Partial** until the operator runs the switch + benchmark on dogfood hardware and posts the evidence comment.
