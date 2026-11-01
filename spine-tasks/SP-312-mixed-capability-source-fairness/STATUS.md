# SP-312: Mixed capability-source fairness within a tier — Status

**Current Step:** Step 1: Implementation
**Status:** In Progress
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
**Status:** Not Started

- [ ] Scale fix in withBenchmarkCapabilities + header comment

---

### Step 2: Testing & Verification
**Status:** Not Started

- [ ] Grounded vs ungrounded same-tier ordering
- [ ] Grounded order and tiers preserved
- [ ] Corpus smoke + gate report before/after
- [ ] Run Contract testCommand
