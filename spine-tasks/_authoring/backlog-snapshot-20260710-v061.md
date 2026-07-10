# Backlog snapshot — 2026-07-10 Release v0.6.1 Stream Abort

Operator-approved via router-backlog-orchestrator. Target: **v0.6.1** (patch).
Prior landed commit on main: SP-168 release gates (ahead of origin by 1).

## Backlog Plan — authored

| Order | Issue | Bucket | SP-ID | Size | Notes |
|-------|-------|--------|-------|------|-------|
| 1 | #89 | bug | SP-169 | S | Abort must not trigger failover |
| 2 | #88 | bug | SP-170 | M | Live stream event piping (after SP-169) |
| 3 | #90 | bug | SP-171 | S | Pre-delegation abort checks (after SP-170) |
| 4 | #91 | feature | SP-172 | S | Commands honor ctx.signal (parallel with SP-169) |
| — | #87 | bug | — | — | Parent tracking; close when #88–#91 closed |

**Ratio this cycle:** 3 bugs + 1 feature (docs bucket empty).

## Wave plan

| Wave | Tasks | Parallel |
|------|-------|----------|
| A | SP-169, SP-172 | ≤2 |
| B | SP-170 | 1 |
| C | SP-171 | 1 |

**Deferred:** #1/#25/#26 hardware probe dogfooding.

**Next Task ID after queue:** SP-173
