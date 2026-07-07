# Backlog snapshot — 2026-07-07

Orchestrator cycle 11. Operator focus: cost overage (#70, #58, #61, #68). Excluded: #1, #25, #26.

## This cycle — authored packets

| Order | Issue | Bucket | SP-ID | Size | Notes |
|-------|-------|--------|-------|------|-------|
| 1 | #70 P0 | bug | SP-096 | M | Virtual subscription cost — immediate cost fix |
| 2 | #70 P1 | bug | SP-097 | M | Quota exhaustion failover |
| 3 | #70 P2 | bug | SP-098 | S | default fleet id + README |
| 4 | #55 | feature | SP-099 | M | Prereq for #58 |
| 5 | #56 | feature | SP-100 | S | Shared embedder |
| 6 | #56 | feature | SP-101 | M | Cluster matcher |
| 7 | #57 | feature | SP-102 | M | Tier features |
| 8 | #58 | feature | SP-103 | M | Low-intensity gate |
| 9 | #61 A | feature | SP-104 | M | P(success) export + baseline |
| 10 | #61 B | feature | SP-105 | M | Online inference |
| 11 | #68 | feature | SP-106 | M | Expected-cost tier selection |

**Ratio this cycle:** 1 bug epic (#70 → 3 tasks) + tier-selection chain (8 tasks).

## Remaining open backlog (not authored this run)

Epic #54/#63: #59, #60, #62–#67, #69, #52–#53 (partial overlap with done SP-091–095).

Context-fit epic #46: largely covered by SP-091–095.

## Wave plan

| Wave | Tasks | Parallel |
|------|-------|----------|
| A | SP-096, SP-099, SP-104 | 3 |
| B | SP-097, SP-098, SP-100 | 3 |
| C | SP-101 | 1 |
| D | SP-102 | 1 |
| E | SP-103 | 1 |
| F | SP-105 | 1 |
| G | SP-106 | 1 |
