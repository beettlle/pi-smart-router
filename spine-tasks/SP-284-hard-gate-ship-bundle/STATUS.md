**Current Step:** Complete (all steps done)
**Status:** Complete
**Last Updated:** 2026-09-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Read CONTEXT + linked issue + migration honesty section (CONTEXT Phase 57 SP-280–SP-286; manifest `spine-tasks/_authoring/release-v1.1.0/manifest.md` — risk plan: gates fail → keep honest-untrained, Partial #168; issue #168 — train on human_feedback/llm_judge only, hard gates ECE_cal ≤ ECE_raw, ECE ≤ 0.10, y_span ≥ 0.05, README/migration match provenance, no invented labels; `docs/migration-v1.md` §"Behavioral calibration artifacts (#110)" — honest floors ≥30 p_success/isotonic, ≥50 triage, ≥100 hydra)
- [x] Confirm v1.0 neutralize still in place until SP-284 ships trained artifacts (read-only check: `config/p-success-weights.json` `trained_sample_count: 0`, all-zero intercept/coefficients; `config/routing-calibration.json` `provenance.source: "neutralized_for_v1_honesty"`, isotonic `y_knots: [0,1]` identity, `neutralize_reason: hybrid_harms_sept_distribution_and_scripted_labels` — neutralize intact pre-SP-284)
- [x] SP-283 outcome confirmed: `data/calibration/verifier-grade-gate-report.json` — `hard_gates_passed: false` (isotonic_ece_absolute 0.2738 > 0.10 FAIL; y_span 1.0000 PASS; ece_improves 0.2738 ≤ 0.3690 PASS); contrib ship-eligible 0/258; candidate artifacts evidence-only → **SP-284 takes the gates-fail path: keep honest-untrained, document (Partial #168)**

## Step 1: Implementation

**Status:** Complete

- [x] Deliver mission outcomes within File Scope

**Outcome:** SP-283 hard gates FAILED (`hard_gates_passed: false`; `isotonic_ece_absolute` 0.2738 > 0.10) → gates-fail path taken per mission + manifest risk plan: **honest-untrained kept, decision documented (#168 Partial)**. No trained artifacts shipped; no labels invented; #95/#96 defaults untouched.

**Changes (all within File Scope):**

- `spine-tasks/_authoring/release-v1.1.0/hard-gate-ship-note.md` (new, must-change per amendment) — full decision record: gate evidence table (from `data/calibration/verifier-grade-gate-report.json`), honest limitations (CI-scale synthetic corpus; 0/258 legacy contrib rows ship-eligible; triage/hydra untrained), what shipped instead, ship preconditions for a future train (`--verifier-grade-only --require-hard-gates`, zero exit + `hard_gates_passed: true`), issue bookkeeping (#168 Partial, #110 open, #95/#96 untouched).
- `config/routing-calibration.json` (must-change) — `provenance.source` stays `neutralized_for_v1_honesty`; `provenance.note` extended with v1.1.0 gate-fail outcome; additive `provenance.post_v1_verifier_grade_attempt` record (task, gate report path, ECE values, `hard_gates_passed: false`, decision `keep_honest_untrained`). Zero behavioral change (p_success/isotonic/triage/hydra/centroids untouched).
- `config/p-success-weights.json` (must-change) — weights unchanged (all-zero, `trained_sample_count: 0`); additive `provenance` annotation (SemVer additive-keys-only; serve-time zod schema strips unknown keys — verified: `p-success-classifier` + `isotonic-calibrator` unit tests 46/46 pass, including the honest-untrained neutral-score test that loads this exact file).
- `docs/migration-v1.md` (must-change) — new subsection "Post-1.0 verifier-grade attempt (v1.1.0) — hard gates failed, honest-untrained remains" under §Behavioral calibration artifacts; matches artifact provenance byte-for-byte (`neutralized_for_v1_honesty`); links the ship note.
- `README.md` (may-change, cross-links only per 2026-09-11 amendment) — one cross-link sentence after the "Provenance today" paragraph pointing to the ship note + migration subsection; no posture text rewritten.

## Step 2: Testing & Verification

**Status:** Complete

- [x] Run contract testCommand — `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1 npm run release:check` exit **0** (2026-09-11; release-gates PASS baseline v0.6.0). Operator-finished after worker exited early while buffering release:check via `tail`.
- [x] Update STATUS with evidence — honest-untrained kept; Partial #168; no #96/#95 flips.
