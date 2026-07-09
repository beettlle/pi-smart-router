# pi-smart-router — Context

**Last Updated:** 2026-07-09
**Status:** Active
**Next Task ID:** SP-154
**Feature:** `001-build-smart-router`
**Task source:** `specs/001-build-smart-router/tasks.md`

---

## Current State

36 spine packets (SP-001–SP-036), all **S** or **M** — no L tasks. Maps T001–T064. Run `spine tasks validate && spine tasks analyze` before batch start.

### Phase 1 — Setup (SP-001–SP-003)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-001 | Package init + dirs + vitest | M | — | T001,T002,T003,T007 |
| SP-002 | ESLint + models.example + stet | S | SP-001 | T004,T005,T006 |
| SP-003 | HyDRA bootstrap + gitignore | S | SP-002 | T006b,T008 |

### Phase 2 — Foundational (SP-004–SP-011)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-004 | Domain types + store port | S | SP-003 | T009,T015 |
| SP-005 | Zod schemas + defaults | S | SP-004 | T010,T012 |
| SP-006 | Contract tests | S | SP-005 | T018 |
| SP-007 | Models loader | S | SP-006 | T011 |
| SP-008 | SQLite core | M | SP-007 | T013 |
| SP-009 | SQLite fallback + memory store | M | SP-008 | T013b,T014,T013c |
| SP-010 | Safe cloud default | S | SP-007 | T016 |
| SP-011 | Pipeline skeleton | S | SP-009, SP-010 | T017 |

### Phase 3 — US1 MVP (SP-012–SP-014)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-012 | Pipeline stubs + gateway | M | SP-011 | T019,T020 |
| SP-013 | Pi extension + factory | M | SP-012 | T021,T021b,T022 |
| SP-014 | MVP tests | S | SP-013 | T023,T024 |

### Phase 4–10 — User Stories (SP-015–SP-033)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-015 | Triage engine | M | SP-014 | T025,T025b,T026 |
| SP-016 | Step 2 triage pipeline | S | SP-015, SP-020 | T027,T028 |
| SP-017 | Session pinner | M | SP-016 | T033,T034 |
| SP-018 | Pinning cache + tests | M | SP-017 | T035–T038 |
| SP-019 | Hardware + local probes | S | SP-014 | T044,T045 |
| SP-020 | Local pipeline + tests | S | SP-019 | T046,T047 |
| SP-021 | Turn classifier | S | SP-014 | T029 |
| SP-022 | Step 2b pipeline | S | SP-021, SP-018 | T030 |
| SP-023 | Sub-route policy + tests | S | SP-022, SP-018 | T031,T032 |
| SP-024 | Telemetry + Step 7 | S | SP-023 | T039,T040 |
| SP-025 | Explain handler | S | SP-014 | T041 |
| SP-026 | Explain tests | S | SP-025 | T042,T043 |
| SP-027 | HyDRA matcher | M | SP-014 | T048 |
| SP-028 | Multi-objective scoring | S | SP-027 | T049 |
| SP-029 | Step 5 matcher pipeline | S | SP-028, SP-024 | T050 |
| SP-030 | Loop escalation + Step 3b | M | SP-029, SP-017 | T051,T052 |
| SP-031 | Pricing engine | M | SP-014 | T053,T054 |
| SP-032 | Gateway resilience + rate limits | M | SP-031, SP-030, SP-018 | T055–T057 |
| SP-033 | Resilience tests | S | SP-032 | T058 |

### Phase 11 — Polish (SP-034–SP-036)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-034 | Finalize stet guardrails | S | SP-016,SP-020,SP-023,SP-026,SP-033 | T059 |
| SP-035 | E2E + benchmarks | M | SP-034 | T060,T061,T062 |
| SP-036 | Quickstart + gate evidence | S | SP-035 | T063,T064 |

### Phase 12 — Pi Provider Extension (SP-037–SP-043)

| Task | Summary | Size | Deps |
|------|---------|------|------|
| SP-037 | Add pi-ai dependency | S | SP-036 |
| SP-038 | Pi model mapper | S | SP-037 |
| SP-039 | Fleet factory | S | SP-038 |
| SP-040 | Extension scaffold + provider | M | SP-039 |
| SP-041 | Stream delegation | M | SP-040 |
| SP-042 | Settings command + scoped mode | S | SP-041 |
| SP-043 | Extension integration tests | S | SP-042 |

### Phase 13 — Extension Dogfooding Gaps (SP-044–SP-046)

| Task | Summary | Size | Deps |
|------|---------|------|------|
| SP-044 | Extension HyDRA wiring + optional transformers | M | SP-043 |
| SP-045 | Extension pricing broker + manual LiteLLM refresh | M | SP-044 |
| SP-046 | Registry Model.cost → ModelProfile pricing | S | SP-045 |

### Phase 14 — Backlog Orchestrator Cycle 1 (SP-047–SP-052)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-047 | Dogfooding docs + operator env vars | S | SP-046 | #13 |
| SP-048 | ESLint fixes + GitHub Actions CI | M | SP-046 | #17 |
| SP-049 | Extension pipeline wiring (P0) | M | SP-046 | #14 |
| SP-050 | Pipeline stage order fix (P0) | M | SP-046 | #15 |
| SP-051 | Lifecycle hook wiring (P0) | M | SP-049 | #16 |
| SP-052 | npm run build + dist exports | M | SP-048 | #18 |

### Phase 15 — Backlog Orchestrator Cycle 2 (SP-053–SP-055)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-053 | Pipeline error telemetry (no silent catch) | S | SP-052 | #20 |
| SP-054 | SessionPinner SQLite wiring (P0) | M | SP-052 | #12 |
| SP-055 | Middleware ghost layer cleanup | M | SP-054 | #19 |

### Phase 16 — Backlog Orchestrator Cycle 3 (SP-056–SP-058)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-056 | Dataset schema + StorePort (SQLite v2) | M | SP-055 | #6 |
| SP-057 | Triage/HyDRA feature plumbing | M | SP-056 | #7 |
| SP-058 | Opt-in dataset recorder + retention | M | SP-057 | #8 |

### Phase 17 — Backlog Orchestrator Cycle 4 (SP-060–SP-062)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-060 | Export dataset JSONL command | M | SP-058 | #9 |
| SP-061 | Prompt fingerprint (Tier 2 opt-in) | M | SP-060 | #10 |
| SP-062 | Outcome labels for training | M | SP-061 | #11 |

### Phase 18 — Backlog Orchestrator Cycle 3.5 (SP-059)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-059 | Provider error UX (no raw JSON) | S | SP-062 | #22 |

### Phase 19 — Backlog Orchestrator Cycle 5 (SP-064–SP-066)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-064 | Turn envelope before session pin (global reorder) | M | SP-059 | #23 |
| SP-065 | Linux hardware probe + SystemInfoPort refactor | M | SP-064 | #1 |
| SP-066 | Windows hardware probe | M | SP-065 | #1 |

### Phase 20 — Backlog Orchestrator Cycle 6 (SP-067–SP-069)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-067 | CI Node 22 fix (undici crash) | S | SP-066 | #24 |
| SP-068 | Gitignore `.pi/` spine doctor entry | S | SP-067 | #28 |
| SP-069 | coverage:check script for buildGate | M | SP-068 | #27 |

### Phase 21 — Backlog Orchestrator Cycle 7 (SP-070–SP-073)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-070 | CI enforce coverage:check in GitHub Actions | S | SP-069 | #29 |
| SP-071 | Rename duplicate triage pipeline stage | S | SP-070 | #31 |
| SP-072 | Remove unsafe double-cast in createRouter() | S | SP-070 | #34 |
| SP-073 | Wire multi-objective scoring into HyDRA matcher | M | SP-071, SP-072 | #30 |

### Phase 22 — Backlog Orchestrator Cycle 7.5 (SP-074)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-074 | Wire cache-warmup economics into session pin break rules | S | SP-073 | #32 |

### Phase 23 — Gemini Tool Session Fixes (SP-075–SP-077)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-075 | Stop thought_signature 400 infra failover; terminal error UX | S | SP-074 | #37 |
| SP-076 | `/smart-router unpin` subcommand for dogfooding | S | SP-074 | #35 |
| SP-077 | Exclude Gemini when session has tool-call history | M | SP-075 | #38 |

### Phase 24 — Dogfood Unblock Batch (#38, #41, #40)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-084 | Gemini tool-history empty-fleet fail-safe | M | SP-083 | #38 |
| SP-085 | Fix inverted routing economics and cost telemetry | M | SP-084 | #41 |
| SP-086 | Map and route cursor/* models explicitly | M | SP-085 | #40 |

### Phase 25 — Shared ModelRegistry (#42)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-087 | Use pi shared ModelRegistry for fleet discovery | M | SP-086 | #42 |

### Phase 26 — Backlog Orchestrator Cycle 8 (SP-088)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-088 | Gate LMU status on active smart-router provider | S | SP-087 | #43 |

### Phase 27 — Backlog Orchestrator Cycle 9 (SP-089–SP-090)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-089 | Fix ESLint CI blocker (no-unused-vars) | S | SP-088 | #45 |
| SP-090 | CI parity verify command + orchestrator alignment | M | SP-089 | #44 |

### Phase 28 — Backlog Orchestrator Cycle 10 (SP-091–SP-095) — Context-fit epic #46

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-091 | Populate estimated_input_tokens in pi extension | S | SP-090 | #47 |
| SP-092 | ModelProfile context limits + LiteLLM ingest | M | SP-090 | #48 |
| SP-093 | Context-fit gate pipeline stage | M | SP-091, SP-092 | #49 |
| SP-094 | Session pin break on context overflow | M | SP-091, SP-092 | #50 |
| SP-095 | Context-overflow fallback routing | M | SP-093, SP-094 | #51 |

**Excluded this cycle:** #1, #25, #26 (hardware probe dogfooding — operator request).

### Phase 29 — Cost Overage / Subscription Economics (#70)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-096 | Cursor subscription virtual cost for HyDRA scoring | M | SP-095 | #70 P0 |
| SP-097 | Cursor quota exhaustion failover | M | SP-096 | #70 P1 |
| SP-098 | Fleet model id default mapping and cost telemetry | S | SP-096 | #70 P2 |

### Phase 30 — Tier Selection Prerequisites (#55–#57)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-099 | Routing cluster config schema and loader | M | SP-095 | #55 |
| SP-100 | Extract shared HyDRA embedder for cluster matching | S | SP-099 | #56 |
| SP-101 | Semantic cluster matcher | M | SP-100 | #56 |
| SP-102 | Tier feature vector and low-intensity score | M | SP-101 | #57 |

### Phase 31 — Low-Intensity Gate + P(success) + Expected Cost (#58, #61, #68)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-103 | Low-intensity tier gate pipeline stage | M | SP-102, SP-093 | #58 |
| SP-104 | P(success) training export and baseline classifier | M | SP-062 | #61 Phase A |
| SP-105 | P(success) online inference in low-intensity gate | M | SP-104, SP-103 | #61 Phase B |
| SP-106 | Expected-cost tier selection | M | SP-105, SP-103 | #68 |

**Excluded:** #1, #25, #26 (hardware — no hardware available).

**Recommended wave order:** SP-096+SP-099+SP-104 (parallel) → SP-097/098, SP-100 → SP-101 → SP-102 → SP-103 → SP-105 → SP-106.

### Phase 32 — Backlog Orchestrator Cycle 12 (#70 completion, #52)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-107 | Wire Cursor quota failover in delegation layer | S | SP-097 | #70 P1 gap |
| SP-108 | Delegation output headroom guard + explicit maxTokens | M | SP-095, SP-092, SP-107 | #52 |
| SP-109 | Length stop error classification (context vs output) | S | SP-108 | #52 |

**Excluded:** #1, #25, #26 (hardware — no hardware available).

**Recommended wave order:** SP-107 → SP-108 → SP-109 (serial; shared `route-and-delegate.ts`).

### Phase 33 — Backlog Orchestrator Cycle 13 (#53, #59–#60, #62, #64–#67, #69)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-110 | Context-fit telemetry and explain endpoint | S | SP-093, SP-095 | #53 |
| SP-111 | Decouple local_zero from trivial-only triage | M | SP-103, SP-101 | #59 |
| SP-112 | HyDRA routing metadata prefix encoder | M | SP-091 | #60 |
| SP-113 | Tier and cluster telemetry and explain endpoint | M | SP-103, SP-106, SP-110 | #62 |
| SP-114 | Offline routing centroid bootstrap script | M | SP-099, SP-101 | #64 |
| SP-115 | HyDRA learned 384×3 projection head | M | SP-112 | #65 |
| SP-116 | Calibration data aggregate and validate pipeline | M | SP-104, SP-114, SP-115 | #66 (part 1) |
| SP-117 | Calibration train serialize and verify pipeline | M | SP-116 | #66 (part 2) |
| SP-118 | Community telemetry contribution export | S | SP-116, SP-060 | #67 |
| SP-119 | Pipeline integration pass for routing stages | M | SP-111, SP-112, SP-115, SP-110, SP-113 | #69 |
| SP-120 | npm release pipeline and publish manifest | M | SP-090 | — |

**Excluded:** #1, #25, #26 (hardware — no hardware available).

**Epic #63:** tracking issue only — do not author XL packet; children above cover roadmap.

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-110, SP-112, SP-114 | Parallel — disjoint scopes |
| B | SP-111, SP-113, SP-115 | SP-113 after SP-110; SP-115 after SP-112 |
| C | SP-116 | After artifact load paths |
| D | SP-117 | Serial after SP-116 |
| E | SP-118 | After SP-116 |
| F | SP-119 | Integration — must be last |

### Phase 34 — Release v0.2.0 Continuity (#72, #73)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-121 | SAAR types, schema, operator config | S | — | #72 |
| SP-122 | SAAR pin state machine | S | SP-121 | #72 |
| SP-123 | Turn envelope + session_pin SAAR wiring | S | SP-122 | #72 |
| SP-124 | Cache breakeven formula module | S | — | #73 |
| SP-125 | Cache breakeven pipeline gate | S | SP-123, SP-124 | #73 |
| SP-126 | Breakeven explain, telemetry, README | S | SP-125 | #72, #73 |

**Source:** v0.2.0 Continuity release plan (issues #72 SAAR pin, #73 cache breakeven gate). Decomposed from two M issues into six S tasks.

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-121 | Types/config foundation |
| B | SP-122, SP-124 | Parallel — disjoint scopes (pinner vs breakeven math) |
| C | SP-123 | SAAR pipeline wiring (serial on router-pipeline) |
| D | SP-125 | Breakeven pipeline gate (serial on router-pipeline) |
| E | SP-126 | Explain/telemetry/README (disjoint from pipeline) |

### Phase 35 — Gemini Replay Repair (v0.2.0 dogfood unblock) (#85)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-127 | Gemini replay repair module | S | SP-075, SP-077 | #85 |
| SP-128 | Wire replay repair in delegation path | S | SP-127 | #85 |
| SP-129 | Narrow Gemini tool-history guard | M | SP-127 | #85, #38 |
| SP-130 | Integration tests, operator docs | S | SP-128, SP-129 | #85 |

**Source:** Gemini replay repair for cross-model delegation ([pi#6342](https://github.com/earendil-works/pi/issues/6342) workaround). Replaces blunt SP-077 exclusion with delegation-context repair + narrowed guard.

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-127 | Parallel with SP-121, SP-124 (disjoint scopes) |
| B | SP-128, SP-129 | Parallel after SP-127; SP-129 also parallel with SP-122 |
| C | SP-130 | After SP-128 + SP-129 |

### Phase 36 — Release v0.3.0 Calibration (#74, #75, #76)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-131 | Richer P(success) training labels | S | SP-117 | #74 (part 1) |
| SP-132 | Isotonic calibrator offline fit and bundle schema | M | SP-131 | #74 (part 2) |
| SP-133 | Online isotonic P(success) lookup in low_intensity gate | S | SP-132 | #74 (part 3) |
| SP-134 | Benchmark score ingest script | M | SP-117 | #75 (part 1) |
| SP-135 | AST tool-call validation for profile ingestion | M | SP-134 | #75 (part 2) |
| SP-136 | Grounded capability profiles in mapper | M | SP-135 | #75 (part 3) |
| SP-137 | Monthly CI profile refresh workflow | S | SP-136 | #75 (part 4) |
| SP-138 | HyDRA seven-flag metadata prefix extension | M | SP-112 | #76 (part 1) |
| SP-139 | Recalibrate projection head after prefix change | S | SP-138 | #76 (part 2) |

**Source:** v0.3.0 Calibration release plan (issues #74 isotonic P(success), #75 benchmark profiles, #76 HyDRA 7-flag prefix). Decomposed from three M issues into nine S/M tasks.

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-131, SP-134, SP-138 | Parallel — disjoint scopes |
| B | SP-132, SP-135, SP-139 | SP-139 after SP-138; SP-132 after SP-131 |
| C | SP-133, SP-136 | SP-133 after SP-132; SP-136 after SP-135 |
| D | SP-137 | After SP-136 |

### Phase 37 — Release v0.4.0 Delegate (#86, #71)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-140 | Consumer-safe resolveModelScope resolution | M | SP-087 | #86 (part 1) |
| SP-141 | Consumer pack extension bootstrap verify | S | SP-140 | #86 (part 2) |
| SP-142 | Planning delegate contract types and explain | S | SP-123 | #71 (part 1) |
| SP-143 | Turn envelope planning delegate path | M | SP-142 | #71 (part 2) |
| SP-144 | Pi extension planning delegate spawn wiring | M | SP-143 | #71 (part 3) |
| SP-145 | Planning delegate integration tests and docs | S | SP-143, SP-144 | #71 (part 4) |

**Source:** v0.4.0 Delegate release plan (issue #86 consumer install bug, issue #71 cache-preserving planning delegate). Decomposed into six S/M tasks.

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-140, SP-142 | Parallel — disjoint scopes |
| B | SP-141, SP-143 | SP-141 after SP-140; SP-143 after SP-142 |
| C | SP-144 | After SP-143 (extension consumes pipeline signal) |
| D | SP-145 | After SP-143 + SP-144 |

### Phase 38 — Release v0.5.0 Economics & Eval (#77, #78, #79)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-146 | OATS centroid interpolation in calibration train | M | SP-114, SP-117 | #77 (part 1) |
| SP-147 | OATS artifact verify and operator docs | S | SP-146 | #77 (part 2) |
| SP-148 | Virtual cost v2 formula module | M | SP-096, SP-106 | #78 (part 1) |
| SP-149 | Virtual cost v2 expected-cost and breakeven wiring | M | SP-148, SP-125 | #78 (part 2) |
| SP-150 | Virtual cost v2 operator docs and regression tests | S | SP-149 | #78 (part 3) |
| SP-151 | Eval harness fixture format and counterfactual replay | M | SP-116 | #79 (part 1) |
| SP-152 | Three-track eval harness (capability, cost, continuity) | M | SP-151 | #79 (part 2) |
| SP-153 | TwinRouterBench track, CI smoke, and local run docs | S | SP-152 | #79 (part 3) |

**Source:** v0.5.0 Economics & Eval release plan (issues #77 OATS, #78 virtual cost v2, #79 eval harness). Decomposed from three P2 issues into eight S/M tasks.

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-146, SP-148, SP-151 | Parallel — disjoint scopes |
| B | SP-147, SP-149, SP-152 | After respective part 1s |
| C | SP-150, SP-153 | Parallel — docs/CI disjoint |

**Excluded:** #80–#84 (v0.6.0), #1/#25/#26 (hardware).

---

## Execution policy

1. **Preflight:** `spine preflight`
2. **Validate:** `spine tasks validate && spine tasks analyze`
3. **Plan:** `spine plan pending`
4. **Land loop:** `spine batch start` → monitor → `spine gate approve` → `spine integrate` → `spine batch complete`
5. **Never** hand-edit `.spine/batch-state.json`

## MVP checkpoint

After **SP-014**: run `npm run typecheck && npm test` — automatic routing with safe default (SC-001).

## Recommended batch waves

28 waves with parallel fan-out (`spine plan pending`, waves 0–27). `lanes.maxParallel: 3` caps concurrent workers; waves with >3 tasks queue within the wave.

| Wave | Packets | Notes |
|------|---------|-------|
| 1–7 | SP-001 → SP-007 | Linear foundation |
| 8 | SP-008, SP-010 | Parallel after SP-007 (SQLite vs safe-default) |
| 9 | SP-009 | After SP-008 |
| 10 | SP-011 | After SP-009 + SP-010 |
| 11–13 | SP-012 → SP-014 | MVP gate |
| 14 | SP-015, SP-019, SP-021, SP-025, SP-027, SP-031 | Six module-only tasks after MVP |
| 15 | SP-026, SP-028 | Explain tests + multi-objective (parallel) |
| 16–25 | SP-020 → SP-033 | Pipeline serial chain + merges (`router-pipeline.ts`) |
| 26–28 | SP-034 → SP-036 | Polish |

`router-pipeline.ts` edits serialize via SP-016 → SP-017 → SP-018 → SP-022 → SP-023 → SP-024 → SP-029 → SP-030 → SP-032; module work fans out at wave 14.

---
