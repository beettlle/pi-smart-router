**Current Step:** Complete (all steps done)
**Status:** Complete
**Last Updated:** 2026-09-11
**Review Level:** 1
**Review Counter:** 2
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Read CONTEXT + linked issue + migration honesty section (CONTEXT Phase 57; issue #168 — train on human_feedback/llm_judge only, hard gates ECE_cal ≤ ECE_raw, ECE ≤ 0.10, y_span ≥ 0.05, no invented labels; docs/migration-v1.md §"What did *not* train (honest floors)" — floors ≥30 p_success/isotonic, ≥50 triage, ≥100 hydra; SP-281 floors + SP-282 adversarial harness landed in prior waves)
- [x] Confirm v1.0 neutralize still in place until SP-284 ships trained artifacts (read-only check: `config/p-success-weights.json` `trained_sample_count: 0`; `config/routing-calibration.json` `provenance.source: "neutralized_for_v1_honesty"` — config/** untouched by this packet; SP-283 writes candidates to `data/calibration/` only)

## Step 1: Implementation

**Status:** Complete

- [x] Deliver mission outcomes within File Scope

**Evidence:**

- **`scripts/train-routing-calibration.ts`** (must-change): verifier-grade train path — `--packs <jsonl...>` joins label packs into the P(success)/isotonic pool; `--verifier-grade-only` scopes every contrib-derived pool to `label_provenance: human_feedback|llm_judge` (SP-281; untagged legacy + scripted_intent dropped); weak pack rows (`exclude_from_holdout_ece`) never train; `--p-success-output` redirects the standalone weights write; `--gate-report` writes the SP-283 hard-gate JSON report; `--require-hard-gates` exits 1 on gate failure (artifacts+report still written). `evaluateIsotonicHardGates` / `buildVerifierGradeGateReport` mirror `verify-routing-calibration.ts` gates (ECE ≤ 0.10, cal ≤ raw, y_span ≥ 0.05); parity locked by unit tests. `hard_gates_passed` true only when trained AND all gates pass — honest-untrained is never a ship pass.
- **Aggregate + train run (offline)**: adversarial llm_judge campaign (recorded CI replay) → 22 labeled (campaign VALID: 2 disagreements excluded, negative fraction 0.2273, 5 distinct failure scores); SWE-Gym verifier pack 4 rows; FC-RewardBench pack 6 rows → `data/calibration/packs/`. Train over 258 dogfood contrib rows + 32 pack rows: contrib ship-eligible **0/258** (untagged legacy → dropped, SP-281 floor honored), labeled pool 32 ≥ 30.
- **Hard gates (gate report + independent verify agree)**: y_span 1.0000 PASS; ece_improves 0.2738 ≤ 0.3690 PASS; **ece_absolute 0.2738 > 0.10 FAIL** → `hard_gates_passed: false`. Candidate artifacts (`data/calibration/verifier-grade-*.json`) are evidence only.
- **Train notes**: `spine-tasks/_authoring/release-v1.1.0/verifier-grade-train-note.md` — pipeline docs, runbook, results table, honest limitations (CI-scale synthetic corpus; 0 real ship-eligible rows; triage/hydra untrained), recommendation to SP-284: keep honest-untrained (Partial #168).
- **Tests** (`tests/unit/train-routing-calibration.test.ts`): 9 new SP-283 cases (gate parity, pack mapping, weak-row guard, provenance scoping, triage honest-untrained, gate verdicts, report semantics) — 28/28 pass.
- Do-NOT honored: `config/*.json` untouched (git status clean on config/); no labels invented (0 untagged rows promoted); #96 defaults untouched; `npm run typecheck` clean; eslint clean.

## Step 2: Testing & Verification

**Status:** Complete

- [x] Run contract testCommand
- [x] Update STATUS with evidence

**Evidence:**

- Contract: `npm run routing:verify-calibration -- --skip-embed`  **exit 0** (2 matched tests pass, 26 skipped by filter; 2026-09-11).
- Full suite: `npm test`  **138 files / 2242 tests passed** (exit 0).
- Task suite: `npx vitest run tests/unit/train-routing-calibration.test.ts`  **28/28 pass** (19 pre-existing + 9 new SP-283).
- Coverage gate: `npm run coverage:check`  **exit 0**.
- `npm run typecheck` clean; `npx eslint scripts/train-routing-calibration.ts tests/unit/train-routing-calibration.test.ts` clean.
- CLI smoke: verifier-grade train  contrib ship-eligible 0/258, pack rows 32/32, labeled pool 32; isotonic trained (fit=26, holdout=6); hard gates y_span PASS / ece_improves PASS / **ece_absolute FAIL (0.2738 > 0.10)**  `hard_gates_passed: false` in `data/calibration/verifier-grade-gate-report.json`. Independent `verify-routing-calibration.ts` on the candidate bundle reports the identical FAIL (18/19) — ship path correctly rejects the candidate. `--require-hard-gates`  exit 1; report-only  exit 0; sample-starved  honest-untrained, never a ship pass.
- Do-NOT guardrails: `config/*.json` untouched (`git status` clean on config/); no scripted_intent row trained (SP-281 skip tests still green); no labels invented (0 untagged rows promoted to ship-eligible); #96 defaults untouched.
- Reviews: plan review requested at step checkpoints (steps 1, 2); engine skipped in-worker spawn (SP-195) — artifacts in `.reviews/`.

**Outcome:** Mission complete — verifier-grade aggregate+train pipeline delivered and exercised; hard ECE gates **fail** on the available CI-scale verifier-grade corpus, so candidate artifacts are evidence-only and SP-284 keeps honest-untrained (Partial #168, per manifest risk plan). See `spine-tasks/_authoring/release-v1.1.0/verifier-grade-train-note.md`.
