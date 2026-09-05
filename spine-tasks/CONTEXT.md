# pi-smart-router — Context

**Last Updated:** 2026-09-05
**Status:** Active
**Next Task ID:** SP-263
**Feature:** `001-build-smart-router`
**Task source:** `specs/001-build-smart-router/tasks.md`
**Released:** **v0.22.0** on npm (2026-09-05, minor — SP-255–SP-262 extension package boundary & ONNX supply-chain; closes #149/#144/#147). Tag `v0.22.0`, commit `d2fce26`. Prior: v0.21.0 (SP-247–SP-254). Human #95 dogfood. #110/#96 open. Dep majors deferred: #162/#163.

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

**Excluded:** #1/#25/#26 (hardware).

### Phase 34 — Backlog Orchestrator v0.6.0 Security & Encoder (SP-154–SP-164)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-154 | Entropy anomaly on prompt tail in triage | M | — | #82 (part 1) |
| SP-155 | Flip-flop shadow log + session tier pin | S | SP-154 | #82 (part 2) |
| SP-156 | Feature-flag encoder + Granite ONNX embedder | M | — | #80 (part 1) |
| SP-157 | Granite latency benchmark + integration test + docs | S | SP-156 | #80 (part 2) |
| SP-158 | ModernBERT K=4 capability heads module | M | SP-157 | #81 (part 1) |
| SP-159 | Wire K=4 into hydra matcher + SP-115 migration | M | SP-158 | #81 (part 2) |
| SP-160 | K=4 head shape tests + offline eval | S | SP-159 | #81 (part 3) |
| SP-161 | pin_only_fallback config + session_pin wiring | M | — | #83 (part 1) |
| SP-162 | Eval harness trigger + telemetry + README | S | SP-161 | #83 (part 2) |
| SP-163 | Rolling median throughput meter | M | — | #84 (part 1) |
| SP-164 | Gate local_zero on tok/s threshold | M | SP-163, SP-161 | #84 (part 2) |

**Source:** v0.6.0 Security & Encoder release plan (issues #80 Granite/ModernBERT, #82 entropy triage, #83 pin-only fallback, #84 tok/s gate). Decomposed from five P3 issues into eleven S/M tasks.

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-154, SP-156, SP-163 | Parallel — disjoint scopes |
| B | SP-155, SP-157 | After respective part 1s |
| C | SP-158, SP-161 | Parallel — disjoint scopes |
| D | SP-159, SP-162 | Parallel — disjoint scopes |
| E | SP-160, SP-164 | SP-164 after SP-161 + SP-163 |

**Excluded:** #1/#25/#26 (hardware dogfooding).

### Phase 35 — Pre-Release Functional Gates (SP-165–SP-168)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-165 | assert-release-gates.ts + release-gates.json | M | — | Tier 0 gate CLI |
| SP-166 | Expand release:check with Tier 0 scripts | S | SP-165 | release.yml wiring |
| SP-167 | @release vitest matrix + test:release | S | — | Functional test matrix |
| SP-168 | Semver baseline JSON + regression compare | M | SP-165, SP-166 | v0.6.0 baseline |

**Source:** Post-v0.6.0 release functional gates epic (operator-approved infra; no GitHub issues).

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-165, SP-167 | Parallel — disjoint scopes |
| B | SP-166 | After SP-165 |
| C | SP-168 | After SP-165 + SP-166 |

### Phase 36 — Release v0.6.1 Stream Abort (SP-169–SP-172)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-169 | Abort must not trigger failover | S | — | #89 |
| SP-170 | Live stream event piping | M | SP-169 | #88 |
| SP-171 | Pre-delegation abort checks | S | SP-170 | #90 |
| SP-172 | Slash commands honor ctx.signal | S | — | #91 |

**Source:** GitHub stream-abort issues #87–#91 (operator-approved backlog for v0.6.1). Ratio: 3 bugs + 1 feature; parent #87 closes when children land.

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-169, SP-172 | Parallel — disjoint scopes (route vs commands) |
| B | SP-170 | After SP-169 |
| C | SP-171 | After SP-170 |

**Deferred:** #1/#25/#26 hardware dogfooding.

### Phase 37 — Release v0.7.0 Dogfood Readiness (SP-173–SP-175)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-173 | Extension operator SAAR wiring | M | — | #92 |
| SP-174 | Fleet capability profiles | M | — | #94 |
| SP-175 | P(success) trained weights | M | SP-174 | #93 |

**Source:** GitHub dogfood-readiness issues #92–#94 (operator-approved backlog for v0.7.0). Ratio: 1 bug + 2 features (docs empty; only one open bug; #95 skipped).

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-173, SP-174 | Parallel — disjoint scopes (extension vs mapper/profiles) |
| B | SP-175 | After SP-174 (README serialization) |

**Deferred:** #95 (operator skip), #96 (modernbert_k4 enablement epic), #1/#25/#26 hardware dogfooding.

### Phase 38 — Release v0.8.0 Dogfood Routing Fixes (SP-176–SP-178)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-176 | Triage/turn-envelope repo-cleanup ≠ zero-tier | M | — | #97 |
| SP-177 | Pre-local_zero tool_use capability gate | M | SP-176 | #98 |
| SP-178 | SAAR pin-break + delegated model in history | M | — | #99 |

**Source:** GitHub dogfood routing issues #97–#99 (operator-approved backlog for v0.8.0). Ratio: 1 bug + 2 features (docs empty; only one open bug; #98/#99 sibling cluster; #95 skipped).

**Recommended wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-176, SP-178 | Parallel — triage vs pinning/history |
| B | SP-177 | After SP-176 (pipeline serialization) |

**Deferred:** #95 (operator skip), #96 (modernbert_k4 enablement epic), #1/#25/#26 hardware dogfooding.

### Phase 39 — Release v0.9.0 Live Leaderboard Ingest + Adapters (SP-179–SP-185) — SHIPPED

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-179 | Live/recorded leaderboard snapshot ingest CLI | M | — | #100 |
| SP-180 | Release-tied CI live refresh + operator docs + mapper smoke | M | SP-179 | #100 |
| SP-181 | Per-benchmark live fallback + adapter registry stubs | M | — | #104 |
| SP-182 | SWE-bench Verified native JSON adapter | M | SP-181 | #104 |
| SP-183 | LiveCodeBench native JSON adapter | M | SP-181 | #104 |
| SP-184 | BFCL gh-pages CSV adapter | M | SP-181 | #104 |
| SP-185 | Terminal-Bench source lock + adapter + README | M | SP-181 | #104 |

**Source:** GitHub #100 (P1) + #104 (native adapters follow-on). Shipped as **v0.9.0** (2026-07-10). Ratio: 0 bugs + 2 features (docs empty; feature-only override).

**Wave order (executed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-179 | Ingest CLI + recorded snapshot |
| B | SP-180 | Workflow + README |
| C | SP-181 | Adapter registry + per-benchmark fallback |
| D | SP-182, SP-183, SP-184 | Parallel native adapters |
| E | SP-185 | Terminal-Bench + live sources table |

**Deferred:** #101/#102 (P2), #103 (P3), #95 dogfood protocol, #96 modernbert_k4 enablement, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.9.0/manifest.md`, `spine-tasks/_authoring/live-leaderboard-adapters-20260710.md`

### Phase 40 — Release v0.9.1 TwinRouterBench Corpus (SP-186–SP-188) — SHIPPED

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-186 | Pin TwinRouterBench + convert question_bank → static-track schema | M | — | #101 |
| SP-187 | Vendor CI-sized corpus subset + checksums | M | SP-186 | #101 |
| SP-188 | Wire corpus CI/gates path + README; close #101 | M | SP-187 | #101 |

**Source:** GitHub #101 (P2). Operator-approved for **v0.9.1** (2026-07-10). Ratio: 0 bugs + 1 feature (docs empty; patch feature override).

**Wave order (executed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-186 | Pin + converter — landed via FF-merge after state_drift |
| B | SP-187 | After SP-186 — same recovery |
| C | SP-188 | After SP-187 — same recovery; closes #101 |

**Deferred:** #102 (P2), #103 (P3), #95, #96, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.9.1/manifest.md`, `spine-tasks/_authoring/backlog-snapshot-20260710-v091.md`  
**Upstream spine bug:** https://github.com/beettlle/pi-spine/issues/196

### Phase 41 — Release v0.9.2 Label Packs (SP-189–SP-191) — SCOPE COMPLETE

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-189 | Privacy-safe label-pack schema + SWE-Gym ingest | M | — | #102 |
| SP-190 | FC-RewardBench ingest + TwinRouterBench weak labels | M | SP-189 | #102 |
| SP-191 | Calibration dry-run ECE + OATS min-sample docs; close #102 | M | SP-190 | #102 |

**Source:** GitHub #102 (P2). Operator-approved for **v0.9.2** (2026-07-11). Ratio: 0 bugs + 1 feature (docs empty; patch feature override; P2 focus).

**Wave order (executed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-189 | batch `20260711T034743` landed |
| B | SP-190 | batch `20260711T035535` landed |
| C | SP-191 | batch `20260711T040426` landed; closes #102 |

**Deferred:** #103 (P3), #95, #96, #105, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.9.2/manifest.md`, `spine-tasks/_authoring/backlog-snapshot-20260711-v092.md`  
**Status:** Published as **v0.9.2** (`b937a7a` / tag `v0.9.2`); Release [run 29162774613](https://github.com/beettlle/pi-smart-router/actions/runs/29162774613) success; on npm as `0.9.2`.

### Phase 42 — Release v0.9.3 LLMRouterBench + Community Bench (SP-192–SP-195)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-192 | Pin LLMRouterBench + code/tool subset ingest | M | — | #103 |
| SP-193 | Offline regret/CS report + staleness docs; close #103 | M | SP-192 | #103 |
| SP-194 | Community-bench CLI Track A (fingerprint + JSON/email) | M | — | #105 |
| SP-195 | Track B skip + Track C + README contribute; close #105 | M | SP-193, SP-194 | #105 |

**Source:** GitHub #103 (P3) + #105 (P3). Operator-approved for **v0.9.3** (2026-07-11). Ratio: 0 bugs + 2 features (docs empty; feature-only override; P3 + #105).

**Wave order (planned):**

| Wave | Tasks | Notes |
|------|-------|-------|
| A | SP-192, SP-194 | Parallel (disjoint scopes) |
| B | SP-193 | After SP-192 |
| C | SP-195 | After SP-193 + SP-194; closes #105 |

**Deferred:** #95, #96, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.9.3/manifest.md`, `spine-tasks/_authoring/backlog-snapshot-20260711-v093.md`

### Phase 43 — Release v0.12.0 Live Shadow Dogfood + Behavioral Calibration (SP-205–SP-206)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-205 | Behavioral calibration docs (zero-manual-label bootstrap) | S | — | Partial #110 |
| SP-206 | Aggregate/train/ship from dogfood exports | M | SP-205 + External #95 exports | Closes #110 when floors met |

**Source:** Operator-approved **v0.12.0** (2026-07-12). Theme: live shadow dogfood (#95 human) + behavioral P(success)/isotonic from real exports (#110).

**Wave order (executed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 1 | SP-205 | Docs landed |
| 2 | SP-206 | Path (B) Partial — no #95 exports; `behavioral-calibration-partial.md` |

**Status:** Published as **v0.12.0**. #110 left open (Partial). #95 human gate still open.

**Human gate:** #95 — `docs/qa/shadow-dogfood-protocol.md` + sign-off (not a spine task).

**Deferred:** #96, #114 (encoder), #1/#25/#26 hardware; #110 train/ship until floors met.

**Authoring notes:** `spine-tasks/_authoring/release-v0.12.0/manifest.md`, `spine-tasks/_authoring/release-v0.12.0/behavioral-calibration-partial.md`

### Phase 44 — Release v0.12.1 Session Stats Hygiene (SP-207)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-207 | Session stats + role cost breakdown (`/smart-router stats`) | M | — | Closes #118 |

**Source:** Operator-approved **v0.12.1** (2026-07-13). Patch profile with **explicit override**: #118 treated as read-only ops hygiene (zero routing change) for pre-#95 dogfood instrumentation.

**Wave order:** single wave — SP-207.

**Status:** Published as **v0.12.1** (tag `v0.12.1`, commit `266b970`). #118 closed. #95 human gate still open.

**Deferred until after #95 dogfood:** #115–#117, #119–#120.

**Authoring notes:** `spine-tasks/_authoring/release-v0.12.1/manifest.md`

### Phase 45 — Release v0.13.0 Multi-Fleet Dogfood Routing Correctness (SP-208–SP-211)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-208 | Multi-fleet capability aliases + Copilot/Gemini/Anthropic coverage | M | — | Closes #124 |
| SP-209 | Honor `force_model_id` / prefer — no silent provider remap | M | SP-208 | Closes #121 |
| SP-210 | Economical pin break/upgrade on hard agentic failure | M | — | Closes #122 |
| SP-211 | Prefer healthy `local_zero` on trivial/no-tool turns | M | SP-209 | Closes #123 |

**Source:** Operator-approved **v0.13.0** (2026-07-19). Theme: multi-fleet dogfood routing correctness.

**Wave order:**

| Wave | Tasks | Notes |
|------|-------|-------|
| 1 | SP-208, SP-210 | Disjoint scopes (mapper/docs vs pinning) |
| 2 | SP-209 | After SP-208; pipeline force/prefer |
| 3 | SP-211 | After SP-209; local_zero preference |

**Status:** Published as **v0.13.0** (npm + GitHub Release). Issues #121–#124 closed. Post-integrate logs: `/tmp/pi-smart-router-post-integrate-wave-{0,1,2}.log`. Release run: https://github.com/beettlle/pi-smart-router/actions/runs/29783858942

**Deferred:** #95/#110 (human/exports), #96/#114 encoder, #115–#117 Colibri, #119/#120 reliability, #125 quota feed, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.13.0/manifest.md`

### Phase 46 — Release v0.14.0 Routing Session Resilience (SP-212–SP-214)

| Task | Summary | Size | Deps | Maps |
|------|---------|------|------|------|
| SP-212 | Degraded neural failover sandwich (learned/heuristic/safe default) | M | — | Closes #119 |
| SP-213 | Bounded timeouts for planning_delegate / fan-out | M | — | Closes #120 |
| SP-214 | Live / estimated quota window feed for virtual cost v2 | M | — | Closes #125 |

**Source:** Operator-approved **v0.14.0** (2026-08-02). Original ask was v0.13.1 patch; reclassified to minor (0 open bugs/docs). Theme: routing session resilience.

**Wave order (proposed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 1 | SP-212 | Failover sandwich — pipeline / routing module |
| 2 | SP-213 | planning_delegate timeouts — extension path |
| 3 | SP-214 | Quota feed — fleet-bootstrap + pricing feed |

**Status:** Published as **v0.14.0** (tag `v0.14.0`, commit `b141394`). Batch `20260802T234103` integrated; #119/#120/#125 closed.

**Deferred:** #95/#110 (human/exports), #96/#114 encoder, #115–#117 Colibri, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.14.0/manifest.md`

### Phase 47 — Release v0.15.0 Colibri Local Affinity & Placement (SP-215–SP-217)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-215 | Workload heat map + soft fleet affinity + hysteresis | M | — | Closes #115 |
| SP-216 | Honest local placement plan/doctor + cold vs warm TPS | M | — | Closes #116 |
| SP-217 | Speculative local/encoder prewarm with acceptance guard | M | — | Closes #117 |

**Source:** Operator-approved **v0.15.0** (2026-08-02). Theme: Colibri-inspired local affinity & placement.

**Wave order (proposed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 0 | SP-215, SP-216, SP-217 | Parallel — disjoint scopes (heat/expected-cost · hardware/commands · prewarm/pipeline) |

**Status:** Published as **v0.15.0** (tag `v0.15.0`, commit `88d5be9`). Batch `20260803T002645` integrated; #115/#116/#117 closed.

**Deferred:** #95/#110 (human/exports), #96/#114 encoder, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.15.0/manifest.md`

### Phase 48 — Release v0.16.0 ModernBERT K=4 Measurement (SP-218–SP-219)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-218 | Train / ship `modernbert-k4-heads.json` (or operator-local Partial) | M | — | Partial #114 |
| SP-219 | Top-1 / shortfall + offline A/B + #96 recommendation writeup | M | SP-218 | Closes #114; Partial #96 |

**Source:** Operator-approved **v0.16.0** (2026-08-03). Theme: ModernBERT K=4 heads + Top-1 / offline A/B measurement (no default flip).

**Wave order (proposed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 0 | SP-218 | Heads artifact first |
| 1 | SP-219 | Measurement + writeup (depends SP-218) |

**Status:** Published as **v0.16.0** (tag `v0.16.0`, commit `ce03be7`). Batches `20260803T070043` (SP-218) + `20260803T223631` (SP-219) integrated; #114 closed; #96 remains open (keep default).

**Deferred:** #95/#110 (human/exports), #96 close (operator enablement), #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.16.0/manifest.md`

### Phase 49 — Release v0.16.1 First-run store + community mapper/limits (SP-220 + PRs)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| PR #128 | Classify gpt-5.5+ as frontier-cloud | S | — | Closes #133 |
| PR #129 | Sync `auto` context window from delegated model | M | — | Closes #134 |
| SP-220 | SQLite first-run parent mkdir (no corrupt-DB theater) | S | — | Closes #130 |

**Source:** Operator-approved **v0.16.1** (2026-08-20). Theme: First-run SQLite correctness + GPT-5.6+ frontier mapping + auto context-window sync.

**Wave order (proposed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| pre | Merge PR #128, #129 | Community land path |
| 0 | SP-220 | After PR merges; disjoint from extension/mapper |

**Status:** Published v0.16.1 (2026-08-20). #130/#133/#134 closed.

**Deferred:** #95/#110, #96, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.16.1/manifest.md`

### Phase 50 — Release v0.18.0 Production Dogfood Resilience (SP-231–SP-236)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-231 | Broaden repairGeminiReplayContext for non-Google toolCalls | M | — | Partial #158 |
| SP-232 | Expand tool-history guard + README for cross-provider Gemini | M | SP-231 | Closes #158 |
| SP-233 | One-shot non-Google protocol-affinity failover on thought_signature 400 | M | SP-232 | Closes #159 |
| SP-234 | Audit hot-path StorePort writes + bounded write-queue design | M | — | Partial #142 |
| SP-235 | Implement bounded async write queue for pins/telemetry | M | SP-234 | Partial #142 |
| SP-236 | Remove fire-and-forget SQLite writes + benchmark + StorePort docs | S | SP-235 | Closes #142 |

**Source:** Operator-approved **v0.18.0** (2026-08-27). Theme: production dogfood resilience — Gemini thought_signature recovery + non-blocking SQLite persistence.

**Wave order (executed):**

| Wave | Tasks | Notes |
|------|-------|-------|
| 0 | SP-231, SP-234 | Parallel — Gemini repair vs SQLite audit |
| 1 | SP-232, SP-235 | Parallel — guard/README vs write queue |
| 2 | SP-233, SP-236 | Parallel — protocol-affinity failover vs cleanup/benchmark |

**Status:** Published as **v0.18.0** (tag `v0.18.0`, commit `3c98cc0`). Batches `20260827T202820-f645` (W0), `20260827T215704-5cfe` (W1), `20260827T224549-9c08` (W2) integrated; #158/#159/#142 closed. Release run: https://github.com/beettlle/pi-smart-router/actions/runs/33202823646. Post-integrate log: `/tmp/pi-smart-router-release-check-v0.18.0.log`.

**Note:** Accidental empty bump `v0.19.0` (commit `855fb08`) also tagged during publish; npm `latest` remains **0.18.0** — deprecate `0.19.0` on npm when credentials available.

**Deferred:** #95/#110 (human/exports), #96, #1/#25/#26 hardware.

**Authoring notes:** `spine-tasks/_authoring/release-v0.18.0/manifest.md`

### Phase 51 — Release v0.19.1 Documentation Parity (SP-237)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-237 | Document library vs extension feature parity gap | S | — | Closes #153 |

**Source:** Operator-approved **v0.19.1** (2026-08-28, patch profile, docs-only). Theme: documentation parity clarification.

**Status:** Published as **v0.19.1** (tag `v0.19.1`, commit `4d11ada`). Batch `20260828T230310-5b57` (W0) integrated at `239aaba`; #153 closed. Post-integrate log: `/tmp/pi-smart-router-post-integrate-wave-0.log`; final gate log: `/tmp/pi-smart-router-release-check-v0.19.1.log` (EXIT=0). Stray npm `0.19.0` (accidental empty bump) deprecated.

**Authoring notes:** `spine-tasks/_authoring/release-v0.19.1/manifest.md`

### Phase 52 — Release v0.19.2 Delegation Stability Hotfix (SP-238)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-238 | Delegate via composed provider for extension-registered custom-API models | S | — | Closes #160 |

**Source:** Operator-approved **v0.19.2** (2026-08-29, patch profile). Theme: delegation stability hotfix — restore delegation to extension-registered custom-API providers (claude-bridge et al.) that always fail with `No API provider registered` (#160).

**Status:** Published as **v0.19.2** (tag `v0.19.2`, commit `196b367`). Batch `20260829T074158-00ea` (W0) integrated at `fa065f1` via runbook §4.1 orch-first + manual merge (stale gate pin after PROMPT-fix commits on main; gate approved and journaled pre-merge); #160 closed. Post-integrate log: `/tmp/pi-smart-router-post-integrate-wave-0.log` (EXIT=0); CI on `fa065f1`: run 33262127548 success. Release run: https://github.com/beettlle/pi-smart-router/actions/runs/33272886791; npm `latest` = 0.19.2.

**Operational notes (2026-08-29 batch):** worker hung at startup (no session transcript) → SIGTERM + engine `needs_retry`; worker timed out after completing all steps → salvage inspection; contract `npm test` failed on pre-existing timing flakes (reproduced on plain main) → contract scoped to task test file (SP-235 convention); worker backgrounded `release:check` and exited without `.DONE` → Step 3 foreground constraint added. Filed: pi-spine #272 (stall watchdog never fired), #273 (timeout classified completed work failed), #274 (salvage --integrate dead-end), #275 (stale-gate re-open refuses phase=completed), #276 (worker background-verification guardrail); router #161 (timing-test flakes, P2 — candidate for next minor).

**Authoring notes:** `spine-tasks/_authoring/release-v0.19.2/manifest.md`

### Phase 53 — Release v0.19.3 Worker Stability + Dependency Freshness (SP-239–SP-240)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-239 | De-flake wall-clock timing assertions (SC-004, local-zero parallel ratio, pi-model-scope) | S | — | Closes #161 |
| SP-240 | Dependency refresh: pi-ai/pi-coding-agent ^0.84.4, zod/tsx lockfile, engines >=22.19.0 | S | SP-239 | Partial #154 |

**Source:** Operator-approved **v0.19.3** (2026-08-29, patch profile). Theme: worker-facing stability hotfix — de-flake wall-clock test suites and refresh dependency alignment to current pi 0.84.x.

**Status:** Published as **v0.19.3** (tag `v0.19.3`, commit `6302059`). Wave 0 batch `20260829T221802-2213` (SP-239) integrated; wave 1 batch `20260829T223430-8d09` (SP-240) — z.ai plan-review 429 → allegretto profile switch + retry, then land. #161 closed. Post-integrate wave-0 log: `/tmp/pi-smart-router-post-integrate-wave-0.log`; wave-1: `/tmp/pi-smart-router-post-integrate-wave-1.log`; Phase 5: `/tmp/pi-smart-router-release-check-v0.19.3.log` (EXIT=0). CI on `2c46360`: run 33332706570 success. Release runs: v0.19.3 → https://github.com/beettlle/pi-smart-router/actions/runs/33332777000 ; accidental empty `v0.19.4` (commit `c96aaf3`) → https://github.com/beettlle/pi-smart-router/actions/runs/33332779987 .

**Operational notes:** Allegretto profile added (`agents.activeProfile`) after z.ai 5h quota blocked plan review. Stale completed batch-state blocked wave-1 start (pi-spine preflight/clear ordering) — terminal pointer removed with archive backup. Accidental empty `npm version` to 0.19.4 four seconds after 0.19.3 — do not treat as a feature release.

**Authoring notes:** `spine-tasks/_authoring/release-v0.19.3/manifest.md`. Dependency majors deferred to #162/#163 (filed 2026-08-29 on operator request).

### Phase 54 — Release v0.20.0 Routing Cost & Verbosity Economics (SP-241–SP-246)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-241 | Capture pi usage actuals into telemetry and stats | M | — | Partial #164 |
| SP-242 | Calibrate cost estimates from rolling usage actuals + README | S | SP-241 | Closes #164 |
| SP-243 | Peak/off-peak pricing adapters (Z.ai + DeepSeek) | M | SP-242 | Partial #165 |
| SP-244 | Peak pricing explain telemetry + README | S | SP-243 | Closes #165 |
| SP-245 | Adaptive reasoning policy + delegation option merge | M | — | Partial #166 |
| SP-246 | Adaptive reasoning operator config + telemetry + README | S | SP-245 | Closes #166 |

**Source:** Operator-approved **v0.20.0** (2026-08-30, minor profile). Theme: routing cost and verbosity economics — usage calibration (#164), peak/off-peak adapters (#165), adaptive reasoning (#166). Dep bumps: check-only (none this train); majors remain #162/#163.

**Status:** **Published v0.20.0** (2026-09-02). Release run https://github.com/beettlle/pi-smart-router/actions/runs/33658081233 success; `npm view` `latest` == `0.20.0`. Issues #164/#165/#166 closed. npm-deprecate dispatched for accidental `0.19.4`.

**Operational notes:** Wave 0 merge conflict on `delegate-stream.ts` / `route-and-delegate.ts` (requestId + reasoningSignal). Wave 1 merge conflict on `routing-telemetry.test.ts` imports. Wave 3 SP-244 landed batch `20260902T000628-d239` (merge `e9726ae`). Allegretto profile used during Z.ai peak. Use `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1` when live benchmark refresh would dirty the tree.

**Authoring notes:** `spine-tasks/_authoring/release-v0.20.0/manifest.md`

### Phase 55 — Release v0.21.0 Runtime Integrity & Operator Trust (SP-247–SP-254)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-247 | Session-state eviction APIs + unit tests | S | — | Partial #145 |
| SP-248 | Wire `session_end` + optional TTL fallback | S | SP-247 | Closes #145 |
| SP-249 | HMAC-pepper `hashSessionIdForTelemetryExport` | S | — | Partial #146 |
| SP-250 | CLI dedupe + contrib export contract tests | S | SP-249 | Closes #146 |
| SP-251 | Missing-weights reason codes (HyDRA + K4) | S | — | Partial #148 |
| SP-252 | `fail_closed_on_missing_weights` + sandwich integration | S | SP-251 | Closes #148 |
| SP-253 | Operator docs for runtime-integrity theme | S | SP-248, SP-250, SP-252 | Theme docs |
| SP-254 | Live leaderboard re-ingest + Gemini fleet aliases | S | — | Hygiene (scope expand) |

**Source:** Operator-approved **v0.21.0** (2026-09-02, minor profile). Theme: runtime integrity & operator trust — session eviction (#145), HMAC telemetry hashes (#146), explicit degraded mode (#148). 7×S split from original 3×M; **scope expand** adds SP-254 capability grounding hygiene (live ingest + aliases; not a 4th enh issue). Dep majors remain #162/#163.

**Status:** **Published v0.21.0** (2026-09-03). Release run https://github.com/beettlle/pi-smart-router/actions/runs/33818051940 success; `npm view` `latest` == `0.21.0`. Issues #145/#146/#148 closed. Scope ID: `SP-247,SP-248,SP-249,SP-250,SP-251,SP-252,SP-253,SP-254`.

**Operational notes:** Wave 0 batch `20260902T232904-2631` (SP-247/249/251/254); wave 1 `20260902T235656-478a` (SP-248/250/252 — SP-252 retried after kimi 5h quota); wave 2 `20260903T181330-01a2` (SP-253). Post-integrate logs: `/tmp/pi-smart-router-post-integrate-wave-{0,1,2}.log`. Pre-tag CI: https://github.com/beettlle/pi-smart-router/actions/runs/33817847475. Single `npm version minor` → `ccaedba` / tag `v0.21.0` — STOP (no second bump).

**Authoring notes:** `spine-tasks/_authoring/release-v0.21.0/manifest.md`

### Phase 56 — Release v0.22.0 Extension Boundary & ONNX Supply-Chain (SP-255–SP-262)

| Task | Summary | Size | Deps | GitHub |
|------|---------|------|------|--------|
| SP-255 | Public package facade exports for extension needs | S | — | Partial #149 |
| SP-256 | Migrate extension deep `src/` imports to facade | S | SP-255 | Partial #149 |
| SP-257 | ESLint/CI guard blocking extension deep imports | S | SP-256 | Closes #149 |
| SP-258 | Vitest extension coverage include + threshold | S | — | Closes #144 |
| SP-259 | Pin ONNX artifacts by SHA-256 + verify on load | S | — | Partial #147 |
| SP-260 | Real embedder `dispose()` + lifecycle tests | S | SP-259 | Closes #147 (w/ SP-261) |
| SP-261 | Supply-chain / offline cache operator docs | S | SP-259 | Partial #147 |
| SP-262 | Theme docs: facade + coverage + pin operator notes | S | SP-257, SP-258, SP-260, SP-261 | Theme docs |

**Source:** Operator-approved **v0.22.0** (2026-09-04, minor profile). Theme: extension package boundary and ONNX embedder supply-chain integrity — #149 facade, #144 coverage gate, #147 digest pins + dispose. 8×S. Dep majors remain #162/#163.

**Status:** **Published v0.22.0** (2026-09-05). Release run https://github.com/beettlle/pi-smart-router/actions/runs/33990680726 success; `npm view` `latest` == `0.22.0`. Issues #149/#144/#147 closed. Scope ID: `SP-255,SP-256,SP-257,SP-258,SP-259,SP-260,SP-261,SP-262`.

**Scope ID:** `SP-255,SP-256,SP-257,SP-258,SP-259,SP-260,SP-261,SP-262`

**Authoring notes:** `spine-tasks/_authoring/release-v0.22.0/manifest.md`

---

## Release v0.16.2 (patch)

**Source:** Operator-approved **v0.16.2** (2026-08-22). Theme: Self-recursion guard + structured loop-escalation failure detection.

| Wave | Tasks | Notes |
|------|-------|-------|
| 0 | SP-221, SP-222 | Parallel — disjoint scopes; addresses PR #126/#127 review |

**Status:** Implemented on `main`; awaiting `release:check` + publish approval.

**Closes:** #131, #132 (on publish). Close PRs #126, #127 with attribution.

**Authoring notes:** `spine-tasks/_authoring/release-v0.16.2/manifest.md`

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
