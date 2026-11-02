# SP-312: Mixed capability-source fairness within a tier — Status

**Current Step:** Complete
**Status:** Done
**Last Updated:** 2026-10-24
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Record current capabilities and corpus-smoke baseline

**Baseline (before fix, 2026-11-01):**
- Capabilities (`npx tsx` dump, `/tmp/sp312/caps-before.txt`): grounded frontier rows sit far below the 0.95 pattern default — claude-opus-4-5 r=0.7670 c=0.7915 t=0.8035, claude-sonnet-4-6 r=0.7380, gemini-3-pro-preview r=0.7740 vs ungrounded claude-fable-5-1 / gemini-4-argon / gemini-3.1-pro-preview all at 0.95 (pattern_default). Grounded economical: claude-haiku-4-5 r=0.6660, claude-3.5-haiku r=0.5685, gemini-2.5-flash r=0.5295 vs ungrounded economical (gpt-5.1) 0.70/0.75/0.70. Grounded models lose to ungrounded same-tier models by source alone.
- Corpus smoke before (`bash scripts/eval/twinrouterbench-full-track.sh`, full output `/tmp/sp312/smoke-before.txt`): exit 0; harness mean_capability_adequacy_rate=0.939096, mean_quality_retention=0.907692, mean_over_routing_rate=0.886914; release-gates report-only FAIL (mean_over_routing_rate 0.886914 > max 0.15; baseline-regression +0.761914 > 0.05 vs v0.6.0).

---

### Step 1: Implementation
**Status:** Complete

- [x] Scale fix in withBenchmarkCapabilities + header comment

**Design (documented in mapper header + `scaleBenchmarkCapabilitiesToFamily` docblock):** grounded vectors rescale per dimension as `score × max(1, familyDefault / familyCohortMax)`, cohort = the benchmark row's matched pattern family. Cohort-best grounded ties the ungrounded same-tier default; remaining gaps equal measured-standing ratios (not source). Strictly monotonic (order preserved), lift-only (never below measured scores — UNKNOWN-family rows like `gpt-5.3-codex` keep raw 0.796/0.833/0.8215 instead of regressing to 0.6/0.65/0.6). Commit eebe4d1c.

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Grounded vs ungrounded same-tier ordering
- [x] Grounded order and tiers preserved
- [x] Corpus smoke + gate report before/after
- [x] Run Contract testCommand

**Contract verification (all green):**
- `npm run typecheck` ✓; `npm run lint` ✓
- `npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-capability-scale.test.ts tests/unit/pi-model-mapper-coverage.test.ts tests/integration/pi-extension.test.ts` ✓ 131/131
- Full `npm test` ✓ 152 files / 2551 tests
- `npm run routing:verify-benchmark-profiles` ✓
- `npm run coverage:check` ✓ exit 0 (pi-model-mapper.ts 96.57% lines, 100% funcs — ≥77% gate)
- `bash scripts/spine-stet-contract-run.sh default SP-312` ✓ 0 active findings after triage

**Discoveries:**
- stet contract review (local qwen reviewer) raised 20 findings on the SP-312 diff; all triaged as false positives / wrong suggestion and dismissed (`stet list` = 0). Recurring reviewer hallucination: claimed `expectedBenchmarkCaps` call sites pass one argument (tsc and vitest disprove); speculative NaN/mutation concerns contradicted by the zod artifact schema and read-only usage. `4c41baf` suggested COMPOSER_CAPS for `cursor/composer-latest` — wrong, the id matches the `cursor/*` rule (dismissed wrong_suggestion).
- `gpt-5.3-codex` matches no MODEL_PATTERN_RULES entry → UNKNOWN_DEFAULTS family; without the lift-only guard the rescale would have regressed it to 0.6/0.65/0.6 (losing to ungrounded economical models by source alone). Lift-only (`max(1, familyDefault/cohortMax)`) keeps raw scores in that case.
- Out-of-scope constraint honored: `tests/integration/pi-extension.test.ts` (not in File Scope) pins grounded flash < 0.7 / shortfall-gate behavior — the family-anchored rescale keeps those passing (flash r=0.5565).

**After (2026-11-01, commit eebe4d1c):**
- Capabilities (`/tmp/sp312/caps-after.txt`): grounded frontier lifted onto the default scale — claude-opus-4-5 r=0.9414 c=0.9500 t=0.9500 (was 0.7670/0.7915/0.8035), claude-sonnet-4-6 r=0.9058 c=0.9164 t=0.9015, gemini-3-pro-preview r=0.9500 (ties the 0.95 ungrounded default); grounded order preserved (gemini-3-pro > opus > sonnet reasoning, opus > sonnet > gemini-3-pro code_gen/tool_use). Ungrounded same-tier models unchanged (fable-5-1 / gemini-4-argon / gemini-3.1-pro-preview still 0.95 pattern_default). Economical cohort-best claude-haiku-4-5 ties the 0.70/0.75/0.70 default; gpt-5.3-codex (UNKNOWN family) keeps raw 0.7960/0.8330/0.8215 (lift-only). Tiers unchanged for every mapped id.
- Corpus smoke after (`--skip-fetch`, `/tmp/sp312/smoke-after.txt`): exit 0; harness metrics byte-identical to before (mean_capability_adequacy_rate=0.939096, mean_quality_retention=0.907692, mean_over_routing_rate=0.886914) — the full-track harness pins its own `pi-smart-router-v0.5.0-eval` catalog, so the rescale causes no corpus regression. Release-gates report-only FAIL is pre-existing and identical before/after (mean_over_routing_rate 0.886914 > 0.15 absolute gate; +0.761914 vs v0.6.0 baseline) — unchanged by this task.
