# Backlog snapshot — 2026-07-09 v0.5.0 Economics & Eval

Orchestrator cycle 16. Operator approved v0.5.0 release scope (#77–#79).

## Backlog Plan — authored

| Order | Issue | Bucket | SP-ID | Size | Notes |
|-------|-------|--------|-------|------|-------|
| 1 | #77 | feature | SP-146 | M | OATS interpolation in calibration train |
| 2 | #77 | feature | SP-147 | S | OATS verify + operator docs |
| 3 | #78 | feature | SP-148 | M | Virtual cost v2 formula (λ decay, KV cache credit) |
| 4 | #78 | feature | SP-149 | M | Wire v2 into expected-cost + breakeven |
| 5 | #78 | feature | SP-150 | S | v2 regression tests + README |
| 6 | #79 | feature | SP-151 | M | Eval fixture schema + counterfactual replay |
| 7 | #79 | feature | SP-152 | M | Three-track harness (capability/cost/continuity) |
| 8 | #79 | feature | SP-153 | S | TwinRouterBench track + CI smoke + docs |

**Ratio this cycle:** 0 bugs + 8 feature tasks (full v0.5.0 decomposition).

**Excluded:** #80–#84 (v0.6.0), #1/#25/#26 (hardware), #86/#71 (v0.4.0 landed — issues still open pending close).

## Wave plan

| Wave | Tasks | Parallel |
|------|-------|----------|
| A | SP-146, SP-148, SP-151 | ≤3 |
| B | SP-147, SP-149, SP-152 | ≤3 |
| C | SP-150, SP-153 | ≤2 |
