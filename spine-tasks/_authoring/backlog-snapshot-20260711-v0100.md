# Backlog snapshot — 2026-07-11 (v0.10.0)

**Orchestrator:** router-backlog-orchestrator  
**Target:** v0.10.0 (0.9.3 → minor)  
**Operator scope:** Approved recommended (2026-07-11)

## Intake

| Issue | Priority | State | Notes |
|-------|----------|-------|-------|
| #95 | — | OPEN → SP-196 Partial | Shadow dogfood protocol + qa script (human sessions remain) |
| #109 | docs | OPEN → SP-197 | Roadmap status sync (filed from draft) |
| #108 | docs/enh | OPEN → SP-198 | Capability profile coverage follow-on #75 |
| #107 | P2 | OPEN → SP-199–SP-200 | TwinRouterBench CI 150 + full static-track path |
| #106 | P2 | OPEN → SP-201 | Weak packs from corpus + `--include-excluded-in-fit` |
| #110 | — | OPEN | Filed only — behavioral calibration (deferred) |
| #111 | — | OPEN | Filed only — Track B adapter (deferred) |
| #112 | — | OPEN | Filed only — over-routing analysis (deferred) |
| #113 | — | OPEN | Filed only — encoder holdout for #96 (deferred) |
| #96 | — | OPEN | Deferred (needs #113 + dogfood evidence) |
| #1/#25/#26 | — | OPEN | Deferred (hardware) |

## Backlog Plan — approved

| Order | Issue | Bucket | Proposed SP-ID | Size | Notes |
|-------|-------|--------|----------------|------|-------|
| 1 | #95 | documentation | SP-196 | S | Land protocol + `qa:shadow-dogfood`; Partial (human QA remains) |
| 2 | #109 | documentation | SP-197 | S | `docs/routing-roadmap.md` status truth |
| 3 | #108 | documentation | SP-198 | M | Fleet `benchmark` vs `pattern_default` coverage |
| 4 | #107 | feature | SP-199 | M | CI subset 50→150 + PROVENANCE |
| 5 | #107 | feature | SP-200 | M | Full-track scripts + optional nightly; Closes #107 |
| 6 | #106 | feature | SP-201 | M | Weak packs from corpus + fit CLI flag; Closes #106 |

**Ratio this cycle:** 0 open bugs; docs-first + 2 P2 features (operator-approved minor profile). Feature count = 2 (#107/#106) after docs bucket.

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-196, SP-197, SP-199 | Disjoint: qa docs, roadmap, twinrouter subset |
| B | SP-198, SP-200, SP-201 | After A; README/corpus consumers serialized via deps |

## Next Task ID after queue

SP-202
