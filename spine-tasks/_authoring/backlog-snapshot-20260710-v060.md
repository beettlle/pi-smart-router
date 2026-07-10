# Backlog snapshot — 2026-07-10 v0.6.0 Security & Encoder

Orchestrator cycle 17. Operator approved v0.6.0 release scope (#80–#84).

## Backlog Plan — authored

| Order | Issue | Bucket | SP-ID | Size | Notes |
|-------|-------|--------|-------|------|-------|
| 1 | #82 | feature | SP-154 | M | Entropy anomaly on prompt tail in triage |
| 2 | #82 | feature | SP-155 | S | Flip-flop shadow log + session tier pin |
| 3 | #80 | feature | SP-156 | M | Feature-flag encoder + Granite ONNX embedder |
| 4 | #80 | feature | SP-157 | S | Granite latency benchmark + integration test + docs |
| 5 | #81 | feature | SP-158 | M | ModernBERT K=4 capability heads module |
| 6 | #81 | feature | SP-159 | M | Wire K=4 into hydra matcher + SP-115 migration |
| 7 | #81 | feature | SP-160 | S | K=4 head shape tests + offline eval |
| 8 | #83 | feature | SP-161 | M | pin_only_fallback config + session_pin wiring |
| 9 | #83 | feature | SP-162 | S | Eval harness trigger + telemetry + README |
| 10 | #84 | feature | SP-163 | M | Rolling median throughput meter |
| 11 | #84 | feature | SP-164 | M | Gate local_zero on tok/s threshold |

**Ratio this cycle:** 0 bugs + 11 feature tasks (full v0.6.0 decomposition).

**Excluded:** #1/#25/#26 (hardware dogfooding — operator excluded).

## Wave plan

| Wave | Tasks | Parallel |
|------|-------|----------|
| A | SP-154, SP-156, SP-163 | ≤3 |
| B | SP-155, SP-157 | ≤2 |
| C | SP-158, SP-161 | ≤2 |
| D | SP-159, SP-162 | ≤2 |
| E | SP-160, SP-164 | ≤2 |
