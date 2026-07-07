# Backlog snapshot — 2026-07-07 cycle 12

Orchestrator cycle 12. Operator focus: **#70** (delegation gap) and **#52** (output headroom). Excluded: #1, #25, #26.

## This cycle — authored packets

| Order | Issue | Bucket | SP-ID | Size | Notes |
|-------|-------|--------|-------|------|-------|
| 1 | #70 P1 gap | bug | SP-107 | S | Wire `shouldFailoverOnProviderError` in route-and-delegate |
| 2 | #52 §1–2 | bug | SP-108 | M | Pre-dispatch headroom + explicit maxTokens |
| 3 | #52 §3 | bug | SP-109 | S | Length stop UX: context vs output truncation |

**Ratio this cycle:** 2 bug issues → 3 S/M tasks (SP-096–098 already landed #70 P0/P2).

## #70 status

| Priority | Task | Status |
|----------|------|--------|
| P0 virtual cost | SP-096 | ✅ .DONE |
| P1 quota failover (gateway) | SP-097 | ✅ .DONE |
| P1 delegation wiring | SP-107 | ⬜ pending |
| P2 fleet id `default` | SP-098 | ✅ .DONE |

Close #70 after SP-107 lands and dogfood confirms quota failover end-to-end.

## #52 decomposition (complete)

| Section | SP-ID | Size |
|---------|-------|------|
| Pre-dispatch validation + output budget | SP-108 | M |
| Provider error classification | SP-109 | S |

Depends on SP-091–095 (context-fit epic) — all .DONE.

## Remaining open backlog — proposed future decomposition

Hardware excluded (#1, #25, #26).

| Issue | Bucket | Proposed split | Est. size |
|-------|--------|----------------|-----------|
| #53 | feature | SP-110 explain context-fit telemetry | S |
| #59 | feature | SP-111 decouple local_zero from trivial triage | M |
| #60 | feature | SP-112 HyDRA metadata prefix encoder | M |
| #62 | feature | SP-113 tier/cluster explain endpoint | M |
| #64 | feature | SP-114 centroid bootstrap script | M |
| #65 | feature | SP-115 HyDRA 384×3 projection head | M |
| #66 | feature | SP-116 build-time calibration pipeline | M (split if >4 steps) |
| #67 | feature | SP-117 community telemetry export | S |
| #69 | feature | SP-118 pipeline integration pass (stage order) | M |

Epics #46, #54, #63: children above; do not author epic packets as XL.

Already covered by landed tasks: #47–51 (SP-091–095), #55–58 (SP-099–103), #61 (SP-104–105), #68 (SP-106).

## Wave plan (cycle 12)

| Wave | Tasks | Parallel |
|------|-------|----------|
| A | SP-107 | 1 |
| B | SP-108 | 1 |
| C | SP-109 | 1 |

SP-107 and SP-108 share `route-and-delegate.ts` — must not run in parallel.

## Launch

```bash
spine tasks validate pending
spine tasks analyze pending
spine plan pending
spine preflight
SPINE_WORKER_STUB=1 spine batch start SP-107
```
