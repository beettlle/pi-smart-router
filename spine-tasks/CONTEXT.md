# pi-smart-router — Context

**Last Updated:** 2026-07-04
**Status:** Active
**Next Task ID:** SP-059
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
