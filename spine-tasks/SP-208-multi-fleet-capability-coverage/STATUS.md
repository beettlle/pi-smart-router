# SP-208: Multi-Fleet Capability Aliases + Coverage — Status

**Current Step:** Step 3
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-20
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Coverage table + aliases

**Status:** ✅ Complete

- [x] Fleet ID list extended (Copilot / Gemini / Anthropic)
- [x] Coverage doc rows + rationales
- [x] Aliases/rows where provider collapse wrong
- [x] Coverage unit tests updated

## Step 2: Protocol cross-link

**Status:** ✅ Complete

- [x] Multi-fleet note in shadow-dogfood protocol
- [x] Optional README pointer reviewed

## Step 3: Testing & Verification

**Status:** 🟡 In Progress

- [ ] Contract `testCommand` green
- [ ] `routing:verify-benchmark-profiles` if profiles changed
- [ ] coverage:check if app code changed
- [ ] #124 commented + closable

---

## Completion Criteria

- [ ] Copilot/Gemini/Anthropic IDs documented
- [ ] Coverage tests assert sources/aliases
- [ ] Protocol multi-fleet note present
- [ ] #75/#108 stay closed
- [ ] #124 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-20 | 1 | plan | skipped (engine-owned; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-20 | JSON aliases are self-sourcing in the `checked-in artifact matches fixture ingest` verify test (round-trips JSON's own aliases). Must keep seed `DEFAULT_FLEET_BENCHMARK_ALIASES` in `scripts/ingest-benchmark-profiles.ts` in sync and regenerate JSON from seed for byte-exact match. | Regenerate `config/benchmark-profiles.json` via ingest fn after seed edit. |
| 2026-07-20 | No mapper (`pi-model-mapper.ts`) change needed — `resolveBenchmarkModelId` + alias map already enforce family-preserving resolution. No-collapse principle is data (aliases), not code. | Scope stays docs + config + tests. |
| 2026-07-20 | **Regression catch (Step 3):** first regen used `DEFAULT_BENCHMARK_FIXTURES_DIR`, which contains complete `claude-3.5-haiku` data across all 4 benchmarks → produced a 5-model JSON with a grounded haiku row → broke `pi-model-mapper.test.ts` (expects haiku `pattern_default`) and added a model the baseline never had. Baseline JSON matches the **recorded** ingest (`DEFAULT_RECORDED_LEADERBOARDS_DIR`) where haiku has only terminal_bench → skipped for missing `code_gen`. | Regenerated from recorded dir (4 models, haiku skipped). `verify:ci` green: 1666/1666 tests, 92.9% line coverage. |

## Notes

Release v0.13.0 — Wave 1 with SP-210 (disjoint scopes).
Design: extend aliases family-preserving (Copilot-Claude→Anthropic row, Copilot-GPT→OpenAI row, Copilot-Gemini→Gemini row). Intentional gaps (o3/o4-mini, gpt-4o, gemini-pro, haiku, flash-tts) stay pattern_default — no grounded row; aliasing would misrepresent capability.
