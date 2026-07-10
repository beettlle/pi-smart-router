# Backlog snapshot — 2026-07-10 Release v0.7.0 Dogfood Readiness

Operator-approved via router-backlog-orchestrator. Target: **v0.7.0** (minor).
Prior on main: v0.6.1 (SP-169–SP-172 stream abort). Package version at plan time: `0.6.1`.

## Backlog Plan — authored

| Order | Issue | Bucket | SP-ID | Size | Notes |
|-------|-------|--------|-------|------|-------|
| 1 | #92 | bug | SP-173 | M | Wire SAAR/operator env into SessionPinner + dispatch |
| 2 | #94 | feature | SP-174 | M | Ground HyDRA profiles for scoped fleet IDs |
| 3 | #93 | feature | SP-175 | M | Ship trained P(success) weights for dogfood |

**Ratio this cycle:** 1 bug + 2 features (operator override — docs empty; only one open bug).

## Wave plan

| Wave | Tasks | Parallel |
|------|-------|----------|
| A | SP-173, SP-174 | ≤2 — extension vs mapper/profiles |
| B | SP-175 | After SP-174 (README serialization) |

## Deferred

| Issue | Reason |
|-------|--------|
| #95 | Operator skip — address later |
| #96 | Enablement epic (measure → A/B → decide); needs dogfood data first |
| #1 / #25 / #26 | Hardware probe dogfooding — blocked on physical access |

## Next Task ID after queue

SP-176
