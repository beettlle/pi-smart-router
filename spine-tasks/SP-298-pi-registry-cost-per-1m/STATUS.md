# SP-298: pi registry Model.cost is per-1M — Status

**Current Step:** Step 2: Testing & Verification
**Status:** Complete
**Last Updated:** 2026-10-20
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Grep other per-token registry cost assumptions — only `deriveFallbackCostPer1M` in `src/config/pi-model-mapper.ts` scales pi registry cost by 1M (sole caller `resolveFallbackCost`, same file)

---

### Step 1: Implementation
**Status:** Complete

- [x] Fix deriveFallbackCostPer1M units + PiRegistryCost comment — rates averaged directly (per-1M), no 1,000,000× scaling
- [x] Negative rate → undefined — either input/output negative → cost unknown → pattern default
- [x] Update fixtures; add gpt-4o-mini and negative-sentinel tests — registryCost fixtures now pi-shaped per-1M (0.15/0.6); 2 new tests added

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Run Contract testCommand — typecheck clean; pi-model-mapper + smart-router-pricing 84/84 pass; full suite 2343/2343 pass; forbidden files untouched
