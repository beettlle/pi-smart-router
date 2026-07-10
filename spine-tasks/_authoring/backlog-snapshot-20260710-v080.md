# Backlog snapshot — 2026-07-10 Release v0.8.0 Dogfood Routing Fixes

Operator-approved via router-backlog-orchestrator. Target: **v0.8.0** (minor).
Prior on main: v0.7.0 (SP-173–SP-175 dogfood readiness). Package version at plan time: `0.7.0`.

## Backlog Plan — authored

| Order | Issue | Bucket | SP-ID | Size | Notes |
|-------|-------|--------|-------|------|-------|
| 1 | #97 | bug | SP-176 | M | Triage/turn-envelope: repo-cleanup ≠ zero-tier |
| 2 | #98 | feature | SP-177 | M | Pre-local_zero tool_use capability gate |
| 3 | #99 | feature | SP-178 | M | SAAR pin-break + delegated model in history |

**Ratio this cycle:** 1 bug + 2 features (operator override — docs empty; only one open bug; #98/#99 dogfood sibling cluster for #97).

## Wave plan

| Wave | Tasks | Parallel |
|------|-------|----------|
| A | SP-176, SP-178 | ≤2 — triage vs pinning/history |
| B | SP-177 | After SP-176 (router-pipeline serialization) |

## Deferred

| Issue | Reason |
|-------|--------|
| #95 | Operator skip — address later |
| #96 | Enablement epic (measure → A/B → decide); needs dogfood data first |
| #1 / #25 / #26 | Hardware probe dogfooding — blocked on physical access |

## Next Task ID after queue

SP-179
