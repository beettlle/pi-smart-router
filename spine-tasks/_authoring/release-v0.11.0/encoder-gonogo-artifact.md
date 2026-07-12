# Encoder Holdout ECE + Latency Go/No-Go Artifact (SP-204 / #113 → #96)

**Date:** 2026-07-11  
**Release:** v0.11.0  
**Soft parent:** [#96](https://github.com/beettlle/pi-smart-router/issues/96) (decision tracker — remains open)  
**Closes:** [#113](https://github.com/beettlle/pi-smart-router/issues/113)  
**Defaults:** **not flipped** — `src/config/defaults.ts` stays `encoder: minilm`, `hydra_heads: learned_projection`

---

## Recommendation (operator action for #96)

| Decision | Verdict | Rationale |
|----------|---------|-----------|
| Keep MiniLM as default encoder | **YES — keep** | No verifier-grade holdout ECE to justify a flip; latency alone is insufficient per #96 AC |
| Promote Granite as default encoder | **NO — not yet** | Latency go (within 120 ms budget), but ECE sample-starved; opt-in via operator config is fine |
| Enable `modernbert_k4` by default | **NO — blocked** | Missing `config/modernbert-k4-heads.json`; no measured Top-1 error vs 10% gate |
| Overall | **Insufficient evidence to flip defaults** | Evidence archived below; operator should approve any future flip only after full packs + K=4 weights |

**Explicit:** This task does **not** modify `src/config/defaults.ts` or `config/release-gates.json`.

---

## Measurement 1 — Pack holdout ECE (`routing:calibration-dry-run`)

**Command:** `npm run routing:calibration-dry-run`  
**Archive (local, gitignored):** `.pi-smart-router/measurements/sp-204/calibration-dry-run.txt`

```text
calibration-dry-run: mode=report_only_sample_starved
  sources=fc-rewardbench,swe-gym,twinrouterbench-weak
  total_rows=13 ece_eligible=10 excluded_from_ece=3
  min_training_samples=30 soft_ece_threshold=0.25
  SAMPLE_STARVED: need ≥30 ECE-eligible rows; report-only (no soft pass/fail)
```

| Field | Value |
|-------|-------|
| Mode | `report_only_sample_starved` |
| ECE-eligible rows | 10 (CI fixtures) |
| Excluded (weak TwinRouterBench) | 3 |
| Soft ECE threshold | 0.25 (advisory only) |
| Soft pass/fail | **Not evaluated** (sample-starved) |

**Blocker:** Full verifier-grade SWE-Gym + FC-RewardBench packs (≥30 ECE-eligible rows) are not present in this worktree. CI fixtures alone cannot satisfy #96’s holdout ECE acceptance criterion. Do **not** invent ECE numbers.

---

## Measurement 2 — Encoder latency (`benchmark:encoder`)

**Command:** `npm run benchmark:encoder`  
**Archive (local, gitignored):** `.pi-smart-router/measurements/sp-204/benchmark-encoder.txt`  
**Fixtures:** `tests/fixtures/agent-turn-samples/agent-turn-samples.json` (20 samples)  
**Cache:** `.pi-smart-router/models/` (MiniLM present; Granite ONNX downloaded on demand)

| Encoder | mean | p50 | p95 | max | Budget |
|---------|------|-----|-----|-----|--------|
| MiniLM (`Xenova/all-MiniLM-L6-v2`) | 17.38 ms | 17.13 ms | 18.39 ms | 19.97 ms | n/a (baseline) |
| Granite (`granite-embedding-97m-multilingual-r2` ONNX) | 17.49 ms | 17.27 ms | 19.06 ms | 20.17 ms | ≤ 120 ms p50/p95 |

**Result:** **PASS** — Granite p50/p95 within HyDRA embedding-stage budget (80–120 ms typical; assert ≤ 120 ms).

**Interpretation:** Latency is a **go** for opt-in Granite (`hydra.encoder: granite` in operator config). It is **not** sufficient alone to promote Granite as the shipped default without holdout ECE / quality evidence (#96).

**Weights note:** MiniLM was already cached. Granite ONNX was fetched into `.pi-smart-router/models/onnx-community/granite-embedding-97m-multilingual-r2-ONNX/` during this run (gitignored; not inventing metrics — measured live).

---

## Measurement 3 — ModernBERT K=4 vs `learned_projection`

| Check | Status |
|-------|--------|
| `config/modernbert-k4-heads.json` | **Missing** (expected path `DEFAULT_MODERNBERT_K4_HEADS_PATH`) |
| ModernBERT ONNX weights | Not required for this blocker (heads file absent first) |
| Top-1 / ECE A/B vs `learned_projection` | **Not run** — blocked on missing heads artifact |
| Enablement gate | `MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD = 0.1` — no measured Top-1 error available |
| Fixture QR (SP-160 historical) | Fixture-only QR retention is **insufficient** per #96 AC — not re-used as flip evidence |

**Blocker:** Provide trained `config/modernbert-k4-heads.json` (and preferably ModernBERT ONNX under the artifact cache), then re-measure Top-1 / pack holdout ECE before any `modernbert_k4` default enablement.

---

## What operators should do next (#96)

1. **Keep defaults** (`minilm` + `learned_projection`) until:
   - Verifier-grade packs yield ≥30 ECE-eligible rows and soft ECE / Top-1 are reported, **and**
   - (For K=4) head weights exist and Top-1 error exceeds ~10% **or** an explicit opt-in dogfood cohort is approved.
2. **Optional:** dogfood Granite via operator config — latency evidence supports it; do not flip shipped defaults yet.
3. **Do not** treat this artifact as approval to edit `src/config/defaults.ts`.

---

## Defaults / gates untouched (verify)

```bash
git diff -- src/config/defaults.ts config/release-gates.json
# expect empty
```

Current defaults (read-only):

```ts
hydra: {
  encoder: 'minilm',
  hydra_heads: 'learned_projection',
}
```

---

## Links

- Issue #96 (product decision tracker)
- Issue #113 (this measurement run)
- Label-pack provenance: `tests/eval/corpus/label-packs/PROVENANCE.md`
- Draft tracker notes: `spine-tasks/_authoring/issues/issue-96-update.md`
