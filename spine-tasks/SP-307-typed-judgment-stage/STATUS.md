# SP-307: typed_judgment pipeline stage (non-deciding, fail-open) — Status

**Current Step:** Step 1: Context and stage module
**Status:** In Progress
**Last Updated:** 2026-11-01
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm SP-304/SP-306 on main; list stage-enum sites
  - SP-304 (`src/domain/ports/typed-judgment-port.ts`, `TypedJudgmentConfig` in schemas.ts) and SP-306 (`src/domain/judgment/*`) present.
  - Stage-enum sites: `PIPELINE_STAGE_ORDER` + orchestrator stage list + header comment (`router-pipeline.ts`), `RoutingStageSchema` (`schemas.ts`), `RoutingStage` union (`entities.ts`), contract JSON stage enum (`specs/001-build-smart-router/contracts/routing-decision.schema.json`). Other `context_overflow_fallback` hits are name references, not enums.

---

### Step 1: Context and stage module
**Status:** In Progress

- [ ] RoutingContext fields + typed-judgment-stage.ts

---

### Step 2: Orchestrator wiring and stage enum
**Status:** Not Started

- [ ] PipelineOptions, stage order, schema + contract enum sync

---

### Step 3: Testing & Verification
**Status:** Not Started

- [ ] Stage order test
- [ ] Success / timeout / error / abort
- [ ] tool_result, acknowledgement, force-model skips
- [ ] Disabled → byte-identical decisions
- [ ] Run Contract testCommand
