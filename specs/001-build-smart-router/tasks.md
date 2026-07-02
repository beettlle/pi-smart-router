# Tasks: Auto-Model Router MVP

**Input**: Design documents from `/specs/001-build-smart-router/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Vitest unit/integration and contract tests per constitution VIII and plan.md. Error-path coverage required for routing failures and store unavailability.

**Organization**: Tasks grouped by user story (spec priorities) with shared setup/foundational phases first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1–US7)
- Include exact file paths in descriptions

## Path Conventions

Single npm package at repository root per plan.md: `src/`, `tests/`, `config/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling

- [ ] T001 Create directory layout per plan.md (`src/domain/`, `src/infrastructure/`, `src/api/`, `src/config/`, `tests/unit/`, `tests/integration/`, `tests/contract/`, `config/`)
- [ ] T002 Initialize npm package with TypeScript 5 strict, Node 20 ESM in `package.json` and `tsconfig.json`
- [ ] T003 [P] Add Vitest config in `vitest.config.ts` and scripts `typecheck`, `test`, `lint` in `package.json`
- [ ] T004 [P] Configure ESLint + `@typescript-eslint` in `.eslintrc.cjs` (ban `any` on routing paths)
- [ ] T005 [P] Add example fleet catalog in `config/models.yaml.example`
- [ ] T006 [P] Add `.stet.yaml` skeleton with zero-crash and triage-bound guardrails (Lane 4.2)
- [ ] T006b [P] Document HyDRA ONNX artifact cache path (default `.pi-smart-router/models/`), verify `.pi-smart-router/` gitignore covers models + state, and add one-time bootstrap note in `quickstart.md` (constitution: no weights in git)
- [ ] T007 [P] Add public package entry in `src/index.ts` exporting router factory types
- [ ] T008 Verify `.pi-smart-router/` is gitignored for SQLite runtime state and ONNX model cache

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, config, persistence, and pipeline skeleton — MUST complete before user stories

**⚠️ CRITICAL**: No user story work until this phase is complete

- [ ] T009 [P] Define domain types (`RoutingRequest`, `RoutingDecision`, `SessionPin`, `ModelProfile`, `PriceCatalog`, `RoutingTelemetry`) in `src/domain/types/`
- [ ] T010 [P] Implement zod schemas mirroring `specs/001-build-smart-router/contracts/*.schema.json` plus `PriceCatalog` fields from `data-model.md` in `src/domain/types/schemas.ts`
- [ ] T011 Implement `models-loader.ts` with zod validation for `config/models.yaml` in `src/config/models-loader.ts`
- [ ] T012 [P] Implement `defaults.ts` (staleness threshold, loop threshold, tool-result size, telemetry caps, `local.min_memory_gb_full`/`local.min_memory_gb_classification`, `hydra.artifact_cache_path`, `frugality.lambda_cost/lambda_latency/lambda_verbosity` per `data-model.md`) in `src/config/defaults.ts` (FR-021)
- [ ] T013 Implement SQLite schema + migrations (pins, rate_limits, price_cache, telemetry) in `src/infrastructure/persistence/sqlite-store.ts` with WAL + `BEGIN IMMEDIATE` token bucket
- [ ] T013b Implement SQLite health check in `src/infrastructure/persistence/sqlite-store.ts`: on corrupt DB rename/delete file → run migrations → reopen; if recreate fails, in-process memory fallback for current process only; log structured warning with outcome (FR-025)
- [ ] T013c [P] Error-path tests in `tests/unit/sqlite-store-fallback.test.ts`: corrupt DB → recreate succeeds → pins persist; recreate failure → memory fallback without host crash
- [ ] T014 [P] Implement in-memory store for unit tests in `src/infrastructure/persistence/memory-store.ts`
- [ ] T015 Define persistence port interface (get/set pin, rate limit, telemetry append, price cache) in `src/domain/types/store-port.ts`
- [ ] T016 Implement `safeCloudDefault()` (economical first, frontier fallback) in `src/domain/pipeline/safe-default.ts`
- [ ] T017 Implement pipeline stage result type and orchestrator skeleton with early-exit in `src/domain/pipeline/router-pipeline.ts`
- [ ] T018 [P] Contract tests validating sample payloads against JSON schemas in `tests/contract/routing-schemas.test.ts`

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Automatic Model Selection (Priority: P1) 🎯 MVP

**Goal**: Intercept every pi agent LLM request and select tier/model before inference; safe default on failure

**Independent Test**: Send mixed agent requests with router enabled; each receives tier assignment without manual model config (SC-001)

### Implementation for User Story 1

- [ ] T019 [US1] Wire pipeline orchestrator with no-op stage stubs for Steps 1–7, early-exit plumbing, and safe-default fallback in `src/domain/pipeline/router-pipeline.ts`; real stage bodies replace stubs in later phases
- [ ] T020 [US1] Implement minimal gateway dispatch (single healthy model selection) in `src/infrastructure/gateway/gateway-dispatch.ts`
- [ ] T021 [US1] Implement pi extension integration (`before_provider_request`, `context`, `session_compact`, `model_select`) in `src/api/middleware/pi-router-middleware.ts` per `contracts/pi-middleware.md`
- [ ] T021b [US1] Finalize pi extension field mapping in `specs/001-build-smart-router/contracts/pi-middleware.md` v1.0.0; update `routing-request.schema.json` if field names differ
- [ ] T022 [US1] Export router factory from `src/index.ts` wiring config loader + pipeline + store
- [ ] T023 [US1] Integration test: request → decision → dispatch mock in `tests/integration/pipeline-mvp.test.ts`
- [ ] T024 [US1] Error-path test: routing failure returns safe economical default without crash in `tests/unit/safe-default.test.ts`

**Checkpoint**: User Story 1 MVP — automatic selection works with safe default (pipeline stubs only; stages filled in Phases 4–9)

---

## Phase 4: User Story 2 — Fast-Path Triage (Priority: P2)

**Goal**: Deterministic trivial vs. complex triage in <5ms with confounder sanitization

**Independent Test**: Curated trivial/complex prompt set routes to expected tiers without override; obvious-case Step 2 exit adds <5ms median overhead (SC-002, SC-003, SC-004)

### Implementation for User Story 2

- [ ] T025 [P] [US2] Implement Aho-Corasick keyword sets and complexity heuristics in `src/domain/triage/triage-engine.ts`
- [ ] T025b [P] [US2] Add AST cyclomatic complexity scan (threshold 15 → frontier tier, `cyclomatic_high` reason code) in `src/domain/triage/triage-engine.ts` using `@typescript-eslint/parser`
- [ ] T026 [US2] Add adversarial complexity inflation sanitization in `src/domain/triage/triage-engine.ts`
- [ ] T027 [US2] Integrate Step 2 triage into `router-pipeline.ts` with <5ms budget and early exit
- [ ] T028 [P] [US2] Unit tests for trivial/complex/obfuscated prompts and AST high-complexity fixtures in `tests/unit/triage-engine.test.ts`

**Checkpoint**: Obvious prompts skip deep matching within SC-004 latency budget

---

## Phase 5: User Story 4 — Session Pinning (Priority: P3)

**Goal**: Pin session to model; break only on qualified events; shared SQLite across processes

**Independent Test**: Multi-turn session without compaction keeps same pin; compaction/override breaks pin (SC-006)

### Implementation for User Story 4

- [ ] T033 [US4] Implement session pinner with exhaustive break rules in `src/domain/pinning/session-pinner.ts` (FR-006, FR-007, FR-008)
- [ ] T034 [US4] Integrate Step 3 pin lookup (<1ms) and pin persistence via `sqlite-store.ts`; Step 3b stub passes through until T052b (US7)
- [ ] T035 [US4] Implement cache-warmup economics check before provider switch in `src/domain/pinning/cache-economics.ts`
- [ ] T036 [US4] Preserve provider cache markers on same-provider paths in `src/infrastructure/gateway/gateway-dispatch.ts` (FR-023)
- [ ] T037 [P] [US4] Unit tests for pin break events, cross-process pin read, and FR-007 negative case (pinned session MUST skip HyDRA re-match on turn N+1 unless qualified break or FR-024 sub-route) in `tests/unit/session-pinner.test.ts`
- [ ] T038 [US4] Integration test: multi-turn pin stability; assert same `model_id` and `stage: session_pin` on pin hits without break events in `tests/integration/session-pinning.test.ts`

**Checkpoint**: Session pinning and cache semantics enforced; pin store ready for US3 sub-routing

---

## Phase 6: User Story 3 — Turn-Aware Routing (Priority: P2)

**Goal**: Classify turn context (role, tools, payload shape); same-provider tool-result sub-routing

**Independent Test**: Session with planning + small tool-result turns respects pin policy and sub-routing rules (FR-024, FR-005)

**Depends on**: T021b (pi field contract), T033–T034 (session pin)

### Implementation for User Story 3

- [ ] T029 [P] [US3] Implement turn envelope classifier in `src/domain/triage/turn-envelope.ts` (<2ms budget)
- [ ] T030 [US3] Integrate Step 2b turn envelope into `router-pipeline.ts`
- [ ] T031 [US3] Implement same-provider economical sub-routing for small tool results in `src/domain/pinning/sub-route-policy.ts` (requires active pin from T033–T034)
- [ ] T032 [P] [US3] Unit tests for turn types and sub-routing thresholds in `tests/unit/turn-envelope.test.ts`

**Checkpoint**: Turn context influences tier within pin rules

---

## Phase 7: User Story 6 — Explainability & Audit (Priority: P3)

**Goal**: Explain endpoint without inference; rolling telemetry retention

**Independent Test**: Explain path returns tier/stage/reason/alternatives; audit query within retention window (SC-008, SC-010)

### Implementation for User Story 6

- [ ] T039 [P] [US6] Implement routing telemetry emitter with 168h / 1111 record rolling window in `src/infrastructure/telemetry/routing-telemetry.ts`
- [ ] T040 [US6] Wire Step 7 telemetry emit in `router-pipeline.ts`
- [ ] T041 [US6] Implement explain handler (no upstream dispatch; no upstream-cost telemetry per `contracts/explain-endpoint.md`) in `src/api/explain/router-explain.ts`
- [ ] T042 [P] [US6] Contract test for explain response shape in `tests/contract/explain-endpoint.test.ts`
- [ ] T043 [US6] Integration test: explain vs live path produce identical decisions in `tests/integration/explain-parity.test.ts`

**Checkpoint**: Operators can audit routing without replaying inference

---

## Phase 8: User Story 5 — Local Zero-Tier (Priority: P4)

**Goal**: Use local tier only when hardware, power, and loaded-model checks pass; instant fallback

**Independent Test**: Scenarios with constrained battery/unloaded model fall back without blocking TTFT (SC-007, FR-012–013)

### Implementation for User Story 5

- [ ] T044 [P] [US5] Implement hardware probe (memory, battery, Apple Silicon) returning `full_local | classification_only | disabled` in `src/infrastructure/hardware/hardware-probe.ts` (≥16GB full, ≥8GB classification-only per `data-model.md`)
- [ ] T045 [US5] Implement LM Studio + Ollama readiness pings (<15ms combined) in `src/infrastructure/local/local-zero-tier.ts`
- [ ] T046 [US5] Integrate Steps 1 + 4 into `router-pipeline.ts` with immediate cloud fallback; classification-only mode MUST NOT dispatch full local inference
- [ ] T047 [P] [US5] Unit tests for 8GB classification-only, 16GB+ full local, battery-disabled, and unreachable local services in `tests/unit/local-zero-tier.test.ts`

**Checkpoint**: Local tier used only when viable

---

## Phase 9: User Story 7 — Loop Rescue & Cost Preference (Priority: P4)

**Goal**: HyDRA matching for ambiguous prompts; pricing; loop escalation; gateway resilience

**Independent Test**: Repeated identical tool failures escalate once; cost preference shifts ambiguous routing (FR-014, FR-019–021)

### Implementation for User Story 7

- [ ] T048 [US7] Implement HyDRA embedding matcher with shortfall scoring in `src/domain/matching/hydra-matcher.ts` (80–120ms budget); load ONNX from configured artifact path (never from repo); shape-validate embeddings; log hyperparameters and decision distribution on init; pre-filter candidates by tier/shortfall gate before scoring (no full-fleet scan per request)
- [ ] T049 [US7] Implement multi-objective score (cost + latency + verbosity) consuming `frugality.lambda_*` from config in `src/domain/scoring/multi-objective.ts` (FR-021)
- [ ] T050 [US7] Integrate Step 5 matcher into `router-pipeline.ts` for ambiguous prompts
- [ ] T051 [US7] Implement loop escalation (bounded identical tool failures) in `src/domain/pinning/loop-escalation.ts`
- [ ] T052 [US7] Integrate Step 3b loop escalation check into `router-pipeline.ts` after Step 3 session pin lookup (FR-014, FR-008)
- [ ] T053 [US7] Implement price broker (override → registry → fallback) in `src/infrastructure/pricing/price-broker.ts`
- [ ] T054 [P] [US7] Implement pricing staleness monitor + operator warning in `src/infrastructure/pricing/pricing-monitor.ts`
- [ ] T055 [US7] Implement circuit breaker in `src/infrastructure/gateway/circuit-breaker.ts` (infra errors only, FR-018)
- [ ] T056 [US7] Extend gateway dispatch with weighted distribution + failover chains in `src/infrastructure/gateway/gateway-dispatch.ts`
- [ ] T057 [US7] Implement per-operator API key rate limiting via SQLite token bucket in `sqlite-store.ts`; reject with HTTP 429, `Retry-After` header, and `{ "error": "rate_limit_exceeded", "retry_after_seconds": N }` body (FR-017)
- [ ] T058 [P] [US7] Unit tests for loop escalation, circuit breaker, rate limit races (assert 429 + retry guidance fields), and seeded RNG for stochastic matcher tests in `tests/unit/resilience.test.ts`

**Checkpoint**: Full routing pipeline with ML matching and cost controls

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Guardrails, docs sync, and validation

- [ ] T059 [P] Finalize `.stet.yaml` rules (extends T006 skeleton): zero-crash, no `any`, triage bounds, no I/O in loops, forbid full-fleet scan per request
- [ ] T060 [P] End-to-end integration test covering full pipeline stages in `tests/integration/full-pipeline.test.ts`
- [ ] T061 [P] Benchmark ambiguous-path routing overhead; assert median <200ms (SC-005) in `tests/integration/routing-latency.test.ts`
- [ ] T062 [P] Cost-comparison fixture: mixed workload vs always-frontier baseline with mocked pricing (SC-009) in `tests/integration/cost-baseline.test.ts`
- [ ] T063 Update `specs/001-build-smart-router/quickstart.md` with actual install/run commands once scripts exist
- [ ] T064 Run `npm run typecheck && npm test` and document results in spine gate evidence
- [x] T065 Decompose tasks into spine `SP-*` packets under `spine-tasks/` with `dependencies.json` (SP-001–SP-014)
- [x] T066 Populate phase tables in `spine-tasks/CONTEXT.md` from this task list

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **blocks all user stories**
- **US1 (Phase 3)**: Depends on Foundational — **MVP target**
- **US2 (Phase 4)**: Depends on Foundational + US1 pipeline stubs
- **US4 (Phase 5)**: Depends on Foundational — **before US3 sub-routing**
- **US3 (Phase 6)**: Depends on T021b + US4 pin lookup (T033–T034)
- **US6 (Phase 7)**: Depends on Foundational + pipeline producing decisions
- **US5 (Phase 8)**: Depends on Foundational; parallel with US6/US7 after US1
- **US7 (Phase 9)**: Depends on Foundational + US4 pinning for loop escalation
- **Polish (Phase 10)**: Depends on desired user stories complete

### User Story Dependencies

| Story | Priority | Depends on | Notes |
|-------|----------|------------|-------|
| US1 | P1 | Phase 2 | MVP — safe default + stub pipeline |
| US2 | P2 | Phase 2, US1 pipeline | Adds Step 2 triage |
| US4 | P3 | Phase 2 | Pin store before US3 sub-routing |
| US3 | P2 | T021b, US4 (T033–T034) | Turn envelope + sub-route policy |
| US6 | P3 | Phase 2, US1 | Telemetry on routed requests |
| US5 | P4 | Phase 2 | Hardware/local Steps 1+4 |
| US7 | P4 | Phase 2, US4 | Matcher + Step 3b loop escalation |

### Pipeline Step Integration Map

| Step | Task(s) |
|------|---------|
| 1 Hardware probe | T046 |
| 2 Triage | T027, T025b |
| 2b Turn envelope | T030 |
| 3 Session pin | T034 |
| 3b Loop escalation | T052 |
| 4 Local zero-tier | T046 |
| 5 HyDRA matcher | T050 |
| 6 Gateway dispatch | T056 |
| 7 Telemetry | T040 |

### Parallel Opportunities

- T003, T004, T005, T006, T006b, T007 in Setup
- T009, T010, T012, T014, T018, T013c in Foundational
- T025, T025b in US2
- US5 hardware (T044) parallel with US6 telemetry (T039) after US1

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (spine SP-012–SP-014)
4. **STOP and VALIDATE**: `npm run typecheck && npm test` at SP-014; demo automatic routing
5. Proceed to US2 triage for cost wins

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → automatic routing MVP (stub pipeline)
3. US2 → fast triage (SC-004 via <5ms Step 2)
4. US4 → session pinning
5. US3 → turn awareness + sub-routing
6. US6 → explain + audit
7. US5 + US7 → local tier + full matcher/resilience
8. Phase 10 → perf benchmarks (SC-005, SC-009) + spine packets

### Spine Batch Mapping (PRD §6 Lanes)

| Lane | Tasks |
|------|-------|
| Lane 1 (Introspection & Heuristics) | T025–T025b, T027–T032, T044–T047 |
| Lane 2 (State, Cost & Gateway) | T033–T038, T039–T043, T051–T057, T013b–T013c |
| Lane 3 (ML & Local) | T048–T050, T044–T047 |
| Lane 4 (Orchestration & Guardrails) | T019–T024, T021b, T041, T059–T064, T006b |

### Spine Packet Mapping (SP-* → T*)

36 packets (SP-001–SP-036), all S or M — no L tasks. MVP checkpoint at **SP-014**.

| SP ID | Title | Size | Maps to | Dependencies |
|-------|-------|------|---------|--------------|
| SP-001 | Package init + dirs + vitest | M | T001,T002,T003,T007 | — |
| SP-002 | ESLint + models.example + stet | S | T004,T005,T006 | SP-001 |
| SP-003 | HyDRA bootstrap + gitignore | S | T006b,T008 | SP-002 |
| SP-004 | Domain types + store port | S | T009,T015 | SP-003 |
| SP-005 | Zod schemas + defaults | S | T010,T012 | SP-004 |
| SP-006 | Contract tests | S | T018 | SP-005 |
| SP-007 | Models loader | S | T011 | SP-006 |
| SP-008 | SQLite core | M | T013 | SP-007 |
| SP-009 | SQLite fallback + memory store | M | T013b,T014,T013c | SP-008 |
| SP-010 | Safe cloud default | S | T016 | SP-009 |
| SP-011 | Pipeline skeleton | S | T017 | SP-010 |
| SP-012 | Pipeline stubs + gateway | M | T019,T020 | SP-011 |
| SP-013 | Pi extension + factory | M | T021,T021b,T022 | SP-012 |
| SP-014 | MVP tests | S | T023,T024 | SP-013 |
| SP-015 | Triage engine | M | T025,T025b,T026 | SP-014 |
| SP-016 | Step 2 triage pipeline | S | T027,T028 | SP-015 |
| SP-017 | Session pinner | M | T033,T034 | SP-016 |
| SP-018 | Pinning cache + tests | M | T035–T038 | SP-017 |
| SP-019 | Hardware + local probes | S | T044,T045 | SP-018 |
| SP-020 | Local pipeline + tests | S | T046,T047 | SP-019 |
| SP-021 | Turn classifier | S | T029 | SP-020 |
| SP-022 | Step 2b pipeline | S | T030 | SP-021 |
| SP-023 | Sub-route policy + tests | S | T031,T032 | SP-022 |
| SP-024 | Telemetry + Step 7 | S | T039,T040 | SP-023 |
| SP-025 | Explain handler | S | T041 | SP-024 |
| SP-026 | Explain tests | S | T042,T043 | SP-025 |
| SP-027 | HyDRA matcher | M | T048 | SP-026 |
| SP-028 | Multi-objective scoring | S | T049 | SP-027 |
| SP-029 | Step 5 matcher pipeline | S | T050 | SP-028 |
| SP-030 | Loop escalation + Step 3b | M | T051,T052 | SP-029 |
| SP-031 | Pricing engine | M | T053,T054 | SP-030 |
| SP-032 | Gateway resilience + rate limits | M | T055–T057 | SP-031 |
| SP-033 | Resilience tests | S | T058 | SP-032 |
| SP-034 | Finalize stet guardrails | S | T059 | SP-016,SP-020,SP-023,SP-026,SP-033 |
| SP-035 | E2E + benchmarks | M | T060,T061,T062 | SP-034 |
| SP-036 | Quickstart + gate evidence | S | T063,T064 | SP-035 |

Packets live in `spine-tasks/{SP-###-slug}/` with `PROMPT.md`, `STATUS.md`, and `spine-tasks/dependencies.json`.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete siblings
- Commit after each task or logical group; spine gates require green `typecheck` + `test`
- T019 wires no-op stubs; each later phase replaces one or more stubs in `router-pipeline.ts`
- T006 (`.stet.yaml` skeleton) is extended by T059 (finalize rules) — do not duplicate guardrail definitions
- Safe default (FR-022): economical-cloud first, frontier only when no economical model healthy
- SQLite store path: `.pi-smart-router/state.db`; try-recreate-then-fallback per FR-025 when store corrupt/unavailable
- MVP spine checkpoint: **SP-014** (not SP-006); 36 S/M packets total (SP-001–SP-036)
- Post-MVP: `pi-router-install.ts` stretch goal — defer until after T064 validation

### Task ID Registry (execution order vs numeric IDs)

Numeric IDs reflect authoring order; US4 (pinning) was assigned T033–T038 before US3 (turn envelope) received T029–T032 because US3 depends on US4. Execution order follows phase dependencies, not numeric sort. Spine decomposition (T065–T066) MUST use execution order, not raw ID sort.

| Execution order | Phase | Task IDs |
|-----------------|-------|----------|
| 1 | US2 Triage | T025–T028 |
| 2 | US4 Pinning | T033–T038 |
| 3 | US3 Turn envelope | T029–T032 |
| 4 | US6 Explain/audit | T039–T043 |
| 5 | US5 Local zero-tier | T044–T047 |
| 6 | US7 Matcher/resilience | T048–T058 |
