# SP-208: Multi-Fleet Capability Aliases + Coverage — Status

**Current Step:** Step 1
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-20
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Coverage table + aliases

**Status:** 🟡 In Progress (awaiting plan-review)

- [x] Fleet ID list extended (Copilot / Gemini / Anthropic)
- [x] Coverage doc rows + rationales
- [x] Aliases/rows where provider collapse wrong
- [x] Coverage unit tests updated

## Step 2: Protocol cross-link

**Status:** ⬜ Not Started

- [ ] Multi-fleet note in shadow-dogfood protocol
- [ ] Optional README pointer reviewed

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

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
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-20 | JSON aliases are self-sourcing in the `checked-in artifact matches fixture ingest` verify test (round-trips JSON's own aliases). Must keep seed `DEFAULT_FLEET_BENCHMARK_ALIASES` in `scripts/ingest-benchmark-profiles.ts` in sync and regenerate JSON from seed for byte-exact match. | Regenerate `config/benchmark-profiles.json` via ingest fn after seed edit. |
| 2026-07-20 | No mapper (`pi-model-mapper.ts`) change needed — `resolveBenchmarkModelId` + alias map already enforce family-preserving resolution. No-collapse principle is data (aliases), not code. | Scope stays docs + config + tests. |

## Notes

Release v0.13.0 — Wave 1 with SP-210 (disjoint scopes).
Design: extend aliases family-preserving (Copilot-Claude→Anthropic row, Copilot-GPT→OpenAI row, Copilot-Gemini→Gemini row). Intentional gaps (o3/o4-mini, gpt-4o, gemini-pro, haiku, flash-tts) stay pattern_default — no grounded row; aliasing would misrepresent capability.
