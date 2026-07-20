# SP-211: Prefer Healthy local_zero on Trivial Turns — Status

**Current Step:** Step 3
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-20
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Preference / explain path

**Status:** ✅ Complete

- [x] Reproduce economical dominance on trivial + healthy local
- [x] Prefer local_zero or explicit explain for economical
- [x] Respect tool-use / tok/s gates
- [x] Counterfactual fixture trivial vs agentic

**Plan-review checkpoint** — Confirm #97 agentic/destructive path still not forced to zero-tier.

## Step 2: Non-regression

**Status:** ✅ Complete

- [x] #97 agentic/destructive not forced to zero-tier
- [x] SP-209 / SP-210 behaviors unchanged

## Step 3: Testing & Verification

**Status:** 🟡 In Progress

- [ ] Contract `testCommand` green
- [ ] Related local_zero tests if touched
- [ ] coverage:check
- [ ] #123 commented + closable

---

## Completion Criteria

- [ ] Trivial + healthy local → local_zero or explicit explain
- [ ] Counterfactual fixture green
- [ ] #97 non-regression green
- [ ] #123 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-20 | Root cause: for no-tool prompts triage rates `ambiguous`, the shipped trained expected-cost tier hint optimizes to frontier/economical, and `resolveLocalEligible`'s `lowIntensityZeroTier` disjunct required `tierHint === 'zero-tier'`, so local_zero was skipped and economical won despite a healthy local model + high low-intensity score. Fix: broaden the low-intensity disjunct to a high score alone (gated by `triageVerdict !== 'complex'`); #97 complex prompts are decided at the triage stage before local_zero, so non-regression holds. | `src/domain/pipeline/router-pipeline.ts` `resolveLocalEligible` |

## Notes

Depends on SP-209. Wave 3 after force/prefer lands.
