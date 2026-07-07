# Backlog snapshot — 2026-07-07 cycle 13

Orchestrator cycle 13. Operator request: decompose all remaining open issues into S/M spine tasks. Excluded: #1, #25, #26 (hardware).

## Backlog Plan — authored

| Order | Issue | Bucket | SP-ID | Size | Notes |
|-------|-------|--------|-------|------|-------|
| 1 | #53 | feature | SP-110 | S | Context-fit telemetry + explain |
| 2 | #59 | feature | SP-111 | M | Local_zero decouple from trivial triage |
| 3 | #60 | feature | SP-112 | M | HyDRA metadata prefix encoder |
| 4 | #62 | feature | SP-113 | M | Tier/cluster telemetry + explain |
| 5 | #64 | feature | SP-114 | M | Centroid bootstrap script |
| 6 | #65 | feature | SP-115 | M | HyDRA 384×3 projection head |
| 7 | #66 | feature | SP-116 | M | Calibration aggregate + validate (split part 1) |
| 8 | #66 | feature | SP-117 | M | Calibration train + verify (split part 2) |
| 9 | #67 | feature | SP-118 | S | Community telemetry contrib export |
| 10 | #69 | feature | SP-119 | M | Pipeline integration pass |

**Ratio this cycle:** 0 bugs + 10 feature tasks (full backlog decomposition).

**Skipped:** #63 epic (tracking only — children cover scope).

**Excluded:** #1, #25, #26.

## Issue → SP mapping

| Issue | SP tasks | Status |
|-------|----------|--------|
| #53 | SP-110 | ⬜ pending |
| #59 | SP-111 | ⬜ pending |
| #60 | SP-112 | ⬜ pending |
| #62 | SP-113 | ⬜ pending |
| #64 | SP-114 | ⬜ pending |
| #65 | SP-115 | ⬜ pending |
| #66 | SP-116, SP-117 | ⬜ pending (split XL → 2×M) |
| #67 | SP-118 | ⬜ pending |
| #69 | SP-119 | ⬜ pending |

Already covered by landed tasks: #47–51 (SP-091–095), #55–58 (SP-099–103), #61 (SP-104–105), #68 (SP-106), #70 (SP-096–098, SP-107), #52 (SP-108–109).

## Wave plan

| Wave | Tasks | Parallel |
|------|-------|----------|
| A | SP-110, SP-112, SP-114 | ≤3 |
| B | SP-111, SP-113, SP-115 | ≤3 (SP-113 needs SP-110) |
| C | SP-116 | 1 |
| D | SP-117 | 1 |
| E | SP-118 | 1 |
| F | SP-119 | 1 |

Hot-file serialization: `router-pipeline.ts` (SP-111, SP-119 serial); `routing-telemetry.ts` / `router-explain.ts` (SP-110 → SP-113 serial); `hydra-matcher.ts` (SP-112 → SP-115 serial).

## Launch

```bash
spine tasks validate pending
spine tasks analyze pending
spine plan pending
spine preflight
SPINE_WORKER_STUB=1 spine batch start SP-110 --wave 1
```
