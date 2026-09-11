**Current Step:** Complete (all steps done)
**Status:** Complete
**Last Updated:** 2026-09-11
**Review Level:** 1
**Review Counter:** 2
**Iteration:** 1
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Read CONTEXT + linked issue + migration honesty section (CONTEXT Phase 57; issue #169 — multi-model generators, 2–3 blinded graders temp 0, ≥20% negatives, ≥5 distinct failure scores, session holdout, `llm_judge` provenance; docs/migration-v1.md honest-untrained posture; SP-281 provenance floors landed in wave 1)
- [x] Confirm v1.0 neutralize still in place until SP-284 ships trained artifacts (read-only check: `config/p-success-weights.json` `trained_sample_count: 0`; `config/routing-calibration.json` `provenance.source: "neutralized_for_v1_honesty"` — config/** untouched by this packet)

## Step 1: Implementation

**Status:** Complete

- [x] Deliver mission outcomes within File Scope

**Evidence:**

- **`scripts/calibration/adversarial-label-campaign.ts`** (new harness): multi-model generate (≥2 generators enforced), 2–3 blinded graders (live graders pinned `temperature: 0`; payload is exactly `{prompt_text, response_text}` — `assertGeneratorBlinded`, no generator identity/task metadata), generator excluded from grading its own response (<2 remaining → fail loud), judge disagreement → excluded from labels (never majority-coerced). Campaign floors per #169: ≥20% genuine negatives (`MIN_NEGATIVE_FRACTION`) + ≥5 distinct failure scores — invalid campaign exits 1 and writes **no** pack artifacts (report still emitted). Session-level holdout via seeded sha256 (`assignSessionHoldout`), holdout in a separate file. Output is schema-valid label-pack JSONL (round-trips `parseLabelPackRow`) with `outcome_signals`: `llm_judge`, `generator:<id>`, `grader:<id>` ×N, `dual_judge_agreement`/`multi_judge_agreement`, `judge_score:<mean>`, `failure_score:<mean>` (negatives), `session_fit`/`session_holdout`. Optional `--warm-start-pack` joins the **fit** file only and must carry `exclude_from_holdout_ece` (mirrors dry-run `--include-excluded-in-fit`). Offline `--recorded` replay + live OpenAI-compatible clients (`ADVERSARIAL_LABEL_API_KEY`). Missing recorded entries / unparseable scores / empty generations all fail loud — never invent labels.
- **`scripts/calibration/README.md`** — usage, contract table, authoring rules (no pre-labels, no keyword-stuffing, no config/ ship here).
- **Fixtures** (may-change scope): `tests/eval/corpus/label-packs/adversarial-llm-judge/ci-tasks.jsonl` (12 synthetic tasks, 4 sessions) + `ci-recorded.jsonl` (24 generations + 48 grades: 5 negatives with distinct means 1.5/2.5/3.0/4.5/5.0, 2 disagreements); PROVENANCE.md section added.
- **`tests/unit/adversarial-label-campaign.test.ts`** — 29 tests (multi-model use, exclusion, blinding, agreement/disagreement, floors, holdout determinism, pool validation, fail-loud paths, recorded replay, live grader temp-0 + blinding, CLI e2e valid/invalid/warm-start/mode-guard).
- Not in production bundle: `scripts/` outside package.json `files`; `config/` untouched.
- CLI smoke: fixture campaign VALID — 22 labeled (11 fit / 11 holdout), 2 disagreements excluded, negative fraction 0.2273, 5 distinct failure scores; no prompt/response leakage.

## Step 2: Testing & Verification

**Status:** Complete

- [x] Run contract testCommand (`npx vitest run tests/unit/label-pack-schema.test.ts` — 4/4 pass)
- [x] Update STATUS with evidence

**Evidence:**

- Contract testCommand: `npx vitest run tests/unit/label-pack-schema.test.ts` → 4/4 pass (2026-09-11).
- New suite: `npx vitest run tests/unit/adversarial-label-campaign.test.ts` → 29/29 pass.
- Full suite: `npm test` → 138 files, 2233/2233 pass (2026-09-11).
- `npm run typecheck` clean; `npx eslint scripts/calibration/ tests/unit/adversarial-label-campaign.test.ts` clean.
- CLI smoke (recorded fixture): campaign VALID — 22 labeled (11 fit / 11 holdout), 2 disagreements excluded, negative fraction 0.2273 ≥ 0.20, 5 distinct failure scores; packs round-trip `loadLabelPackJsonl`; no prompt/response leakage.
- Coverage gate: not applicable — deliverable is `scripts/` harness + tests (no `src/` / extension changes), matching SP-281 precedent.
- Reviews: plan review requested at step checkpoints (steps 1, 2); engine skipped in-worker spawn (SP-195) — review artifacts in `.reviews/`.
- Do-NOT honored: no labels invented (missing replay/unparseable scores fail loud); no pack pre-labels (disagreements excluded); no config/ changes; `config/p-success-weights.json` + `config/routing-calibration.json` untouched; #96 defaults untouched; scripts/ not in published bundle.
