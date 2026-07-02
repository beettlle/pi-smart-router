#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const packets = [
  {
    id: "SP-001",
    slug: "package-init",
    size: "M",
    review: 1,
    score: "2/8",
    assessment: "Greenfield npm/TS/vitest bootstrap.",
    mission: "Create directory layout, npm package with TypeScript 5 strict + Node 20 ESM, Vitest scripts, and public entry stub. Maps to T001, T002, T003, T007.",
    deps: [],
    context: ["spine-tasks/CONTEXT.md", "specs/001-build-smart-router/plan.md"],
    scope: ["package.json", "tsconfig.json", "vitest.config.ts", "src/index.ts", "src/domain/", "src/infrastructure/", "src/api/", "src/config/", "tests/unit/", "tests/integration/", "tests/contract/", "config/"],
    mustChange: "package.json, tsconfig.json, src/index.ts",
    mustNotChange: "specs/001-build-smart-router/spec.md",
    criteria: "Directory layout exists; npm scripts typecheck/test/lint run.",
    steps: [
      { title: "Structure and package init", items: ["T001: Create directory layout per plan.md", "T002: Initialize npm + TypeScript strict ESM", "T007: Public entry stub in src/index.ts"] },
      { title: "Vitest and scripts", items: ["T003: vitest.config.ts + typecheck/test/lint scripts"] },
    ],
    doNot: ["Implement routing logic", "Commit model weights"],
  },
  {
    id: "SP-002",
    slug: "tooling-config",
    size: "S",
    review: 1,
    score: "1/8",
    assessment: "Linting and example config only.",
    mission: "Configure ESLint, example fleet catalog, and stet guardrails skeleton. Maps to T004, T005, T006.",
    deps: ["SP-001"],
    context: ["config/models.yaml.example", ".cursor/rules/"],
    scope: [".eslintrc.cjs", "config/models.yaml.example", ".stet.yaml"],
    mustChange: ".eslintrc.cjs, config/models.yaml.example",
    mustNotChange: "src/domain/**",
    criteria: "ESLint runs; example catalog validates.",
    steps: [
      { title: "Tooling", items: ["T004: ESLint + @typescript-eslint", "T005: config/models.yaml.example", "T006: .stet.yaml skeleton"] },
    ],
    doNot: ["Extend stet rules beyond skeleton (SP-034)"],
  },
  {
    id: "SP-003",
    slug: "bootstrap-gitignore",
    size: "S",
    review: 0,
    score: "1/8",
    assessment: "Docs and gitignore verification.",
    mission: "Document HyDRA ONNX cache bootstrap and verify .pi-smart-router/ gitignore. Maps to T006b, T008.",
    deps: ["SP-002"],
    context: ["specs/001-build-smart-router/quickstart.md", ".gitignore"],
    scope: [".gitignore", "specs/001-build-smart-router/quickstart.md"],
    mustChange: "specs/001-build-smart-router/quickstart.md",
    mustNotChange: "src/**",
    criteria: ".pi-smart-router/ gitignored for state.db and models/.",
    steps: [
      { title: "Bootstrap docs", items: ["T006b: HyDRA cache bootstrap section in quickstart.md", "T008: Verify .pi-smart-router/ gitignore"] },
    ],
    doNot: ["Download ONNX weights into repo"],
  },
  {
    id: "SP-004",
    slug: "domain-types",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Core domain type definitions.",
    mission: "Define domain types and persistence port interface. Maps to T009, T015.",
    deps: ["SP-003"],
    context: ["specs/001-build-smart-router/data-model.md"],
    scope: ["src/domain/types/**"],
    mustChange: "src/domain/types/",
    mustNotChange: "src/infrastructure/**",
    criteria: "All entity types and store port defined.",
    steps: [
      { title: "Domain types", items: ["T009: RoutingRequest, RoutingDecision, SessionPin, ModelProfile, PriceCatalog, RoutingTelemetry", "T015: store-port.ts interface"] },
    ],
    doNot: ["Implement zod schemas (SP-005)"],
  },
  {
    id: "SP-005",
    slug: "schemas-defaults",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Zod schemas and operator defaults.",
    mission: "Implement zod schemas mirroring contracts and defaults.ts. Maps to T010, T012.",
    deps: ["SP-004"],
    context: ["specs/001-build-smart-router/contracts/", "specs/001-build-smart-router/data-model.md"],
    scope: ["src/domain/types/schemas.ts", "src/config/defaults.ts"],
    mustChange: "src/domain/types/schemas.ts, src/config/defaults.ts",
    mustNotChange: "src/infrastructure/**",
    criteria: "Defaults include memory thresholds, frugality lambdas, artifact path.",
    steps: [
      { title: "Schemas and defaults", items: ["T010: Zod schemas mirroring contracts + PriceCatalog", "T012: defaults.ts per data-model.md (FR-021)"] },
    ],
    doNot: ["Implement SQLite (SP-008)"],
  },
  {
    id: "SP-006",
    slug: "contract-tests",
    size: "S",
    review: 1,
    score: "2/8",
    assessment: "Contract validation tests.",
    mission: "Contract tests for JSON schemas. Maps to T018.",
    deps: ["SP-005"],
    context: ["specs/001-build-smart-router/contracts/routing-request.schema.json", "specs/001-build-smart-router/contracts/routing-decision.schema.json"],
    scope: ["tests/contract/routing-schemas.test.ts"],
    mustChange: "tests/contract/routing-schemas.test.ts",
    mustNotChange: "src/infrastructure/**",
    criteria: "Sample payloads validate against schemas.",
    steps: [
      { title: "Contract tests", items: ["T018: routing-schemas.test.ts"] },
    ],
    doNot: ["Modify JSON schema files unless drift found"],
  },
  {
    id: "SP-007",
    slug: "models-loader",
    size: "S",
    review: 1,
    score: "2/8",
    assessment: "Single-module fleet catalog loader.",
    mission: "Implement models.yaml loader with zod validation. Maps to T011.",
    deps: ["SP-006"],
    context: ["config/models.yaml.example", "src/domain/types/schemas.ts"],
    scope: ["src/config/models-loader.ts", "tests/unit/models-loader.test.ts"],
    mustChange: "src/config/models-loader.ts",
    mustNotChange: "src/infrastructure/persistence/**",
    criteria: "Valid catalog loads; invalid YAML fails clearly.",
    steps: [
      { title: "Loader", items: ["T011: models-loader.ts with zod validation"] },
      { title: "Tests", items: ["Unit tests: valid catalog, missing tier, invalid schema"] },
    ],
    doNot: ["Implement persistence (SP-008)"],
  },
  {
    id: "SP-008",
    slug: "sqlite-core",
    size: "M",
    review: 2,
    score: "4/8",
    assessment: "SQLite schema and token bucket.",
    mission: "SQLite schema, migrations, WAL mode, token bucket. Maps to T013.",
    deps: ["SP-007"],
    context: ["specs/001-build-smart-router/data-model.md", "src/domain/types/store-port.ts"],
    scope: ["src/infrastructure/persistence/sqlite-store.ts"],
    mustChange: "src/infrastructure/persistence/sqlite-store.ts",
    mustNotChange: "src/domain/pipeline/router-pipeline.ts",
    criteria: "Migrations run; WAL enabled; token bucket uses BEGIN IMMEDIATE.",
    steps: [
      { title: "SQLite store", items: ["T013: Schema + migrations (pins, rate_limits, price_cache, telemetry)", "WAL + BEGIN IMMEDIATE token bucket"] },
    ],
    doNot: ["Implement health check fallback (SP-009)"],
  },
  {
    id: "SP-009",
    slug: "sqlite-fallback",
    size: "M",
    review: 2,
    score: "5/8",
    assessment: "Corrupt DB recovery and memory store.",
    mission: "SQLite health check, recreate-then-fallback, in-memory store, error-path tests. Maps to T013b, T014, T013c.",
    deps: ["SP-008"],
    context: ["specs/001-build-smart-router/spec.md (FR-025)"],
    scope: ["src/infrastructure/persistence/sqlite-store.ts", "src/infrastructure/persistence/memory-store.ts", "tests/unit/sqlite-store-fallback.test.ts"],
    mustChange: "src/infrastructure/persistence/memory-store.ts",
    mustNotChange: "src/domain/pipeline/router-pipeline.ts",
    criteria: "Corrupt DB recreates or falls back; no host crash.",
    steps: [
      { title: "Fallback paths", items: ["T013b: Corrupt DB rename → migrations → reopen; memory fallback on failure", "T014: memory-store.ts for unit tests"] },
      { title: "Error-path tests", items: ["T013c: Recreate succeeds; recreate failure → memory fallback"] },
    ],
    doNot: ["Implement safeCloudDefault (SP-010)"],
  },
  {
    id: "SP-010",
    slug: "safe-default",
    size: "S",
    review: 1,
    score: "2/8",
    assessment: "Economical-first safe cloud default.",
    mission: "Implement safeCloudDefault() economical first, frontier fallback. Maps to T016 (FR-022).",
    deps: ["SP-009"],
    context: ["specs/001-build-smart-router/spec.md (FR-022)", "src/config/models-loader.ts"],
    scope: ["src/domain/pipeline/safe-default.ts", "tests/unit/safe-default.test.ts"],
    mustChange: "src/domain/pipeline/safe-default.ts",
    mustNotChange: "src/domain/pipeline/router-pipeline.ts",
    criteria: "Never throws; picks economical then frontier.",
    steps: [
      { title: "Safe default", items: ["T016: safeCloudDefault() in safe-default.ts", "Basic unit test for tier ordering"] },
    ],
    doNot: ["Wire pipeline orchestrator (SP-011)"],
  },
  {
    id: "SP-011",
    slug: "pipeline-skeleton",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Pipeline orchestrator skeleton only.",
    mission: "Pipeline stage result type and orchestrator skeleton with early-exit and safe-default fallback. Maps to T017.",
    deps: ["SP-010"],
    context: ["specs/001-build-smart-router/plan.md (Pipeline Design)"],
    scope: ["src/domain/pipeline/router-pipeline.ts", "tests/unit/router-pipeline.test.ts"],
    mustChange: "src/domain/pipeline/router-pipeline.ts",
    mustNotChange: "src/infrastructure/gateway/**",
    criteria: "Stage chain runs; failures invoke safeCloudDefault without throw.",
    steps: [
      { title: "Orchestrator", items: ["T017: Stage result type + orchestrator with placeholder Steps 1–7", "Skeleton test: failure returns safe default"] },
    ],
    doNot: ["Implement pi extension (SP-013)"],
  },
  {
    id: "SP-012",
    slug: "mvp-pipeline-gateway",
    size: "M",
    review: 2,
    score: "4/8",
    assessment: "MVP pipeline stubs and gateway dispatch.",
    mission: "Wire pipeline with no-op stage stubs and minimal gateway dispatch. Maps to T019, T020.",
    deps: ["SP-011"],
    context: ["src/domain/pipeline/router-pipeline.ts"],
    scope: ["src/domain/pipeline/router-pipeline.ts", "src/infrastructure/gateway/gateway-dispatch.ts"],
    mustChange: "src/infrastructure/gateway/gateway-dispatch.ts",
    mustNotChange: "src/api/middleware/**",
    criteria: "Pipeline stubs wired; single healthy model selected.",
    steps: [
      { title: "Pipeline and gateway", items: ["T019: No-op stage stubs Steps 1–7 with early-exit", "T020: Minimal gateway dispatch"] },
    ],
    doNot: ["Implement pi extension (SP-013)"],
  },
  {
    id: "SP-013",
    slug: "mvp-pi-extension",
    size: "M",
    review: 2,
    score: "5/8",
    assessment: "Pi extension integration and factory export.",
    mission: "Pi extension integration per pi-middleware.md v1.0.0 and router factory export. Maps to T021, T021b, T022.",
    deps: ["SP-012"],
    context: ["specs/001-build-smart-router/contracts/pi-middleware.md"],
    scope: ["src/api/middleware/pi-router-middleware.ts", "src/index.ts", "specs/001-build-smart-router/contracts/routing-request.schema.json"],
    mustChange: "src/api/middleware/pi-router-middleware.ts, src/index.ts",
    mustNotChange: "src/domain/triage/**",
    criteria: "Extension hooks registered; factory exports router.",
    steps: [
      { title: "Pi integration", items: ["T021: before_provider_request, context, session_compact, model_select", "T021b: Confirm contract v1.0.0; update schema if needed", "T022: Export router factory from src/index.ts"] },
    ],
    doNot: ["Implement triage or pinning stages"],
  },
  {
    id: "SP-014",
    slug: "mvp-tests",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "MVP integration and error-path tests.",
    mission: "MVP integration test and safe-default error-path test. Maps to T023, T024. MVP checkpoint.",
    deps: ["SP-013"],
    context: ["specs/001-build-smart-router/spec.md (US1, SC-001)"],
    scope: ["tests/integration/pipeline-mvp.test.ts", "tests/unit/safe-default.test.ts"],
    mustChange: "tests/integration/pipeline-mvp.test.ts",
    mustNotChange: "src/domain/triage/**",
    criteria: "Request → decision → dispatch; routing failure returns safe default (SC-001).",
    steps: [
      { title: "MVP tests", items: ["T023: pipeline-mvp.test.ts integration", "T024: safe-default error-path test"] },
    ],
    doNot: ["Expand scope beyond US1 MVP"],
  },
  {
    id: "SP-015",
    slug: "triage-engine",
    size: "M",
    review: 2,
    score: "4/8",
    assessment: "Fast-path triage engine with AST scan.",
    mission: "Aho-Corasick heuristics, AST cyclomatic scan, adversarial sanitization. Maps to T025, T025b, T026.",
    deps: ["SP-014"],
    context: ["specs/001-build-smart-router/spec.md (US2, FR-003, FR-004)"],
    scope: ["src/domain/triage/triage-engine.ts"],
    mustChange: "src/domain/triage/triage-engine.ts",
    mustNotChange: "src/domain/pipeline/router-pipeline.ts",
    criteria: "Trivial/complex/obfuscated prompts classified correctly.",
    steps: [
      { title: "Triage engine", items: ["T025: Aho-Corasick keyword sets", "T025b: AST cyclomatic scan (threshold 15)", "T026: Adversarial sanitization"] },
    ],
    doNot: ["Integrate pipeline Step 2 (SP-016)"],
  },
  {
    id: "SP-016",
    slug: "triage-pipeline",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Step 2 pipeline integration and triage tests.",
    mission: "Integrate Step 2 triage into pipeline with <5ms budget and unit tests. Maps to T027, T028.",
    deps: ["SP-015"],
    context: ["src/domain/triage/triage-engine.ts"],
    scope: ["src/domain/pipeline/router-pipeline.ts", "tests/unit/triage-engine.test.ts"],
    mustChange: "src/domain/pipeline/router-pipeline.ts (Step 2 only)",
    mustNotChange: "src/domain/pinning/**",
    criteria: "Step 2 early exit within SC-004 budget.",
    steps: [
      { title: "Integration and tests", items: ["T027: Step 2 integration with <5ms budget", "T028: triage-engine.test.ts"] },
    ],
    doNot: ["Modify triage-engine.ts except import wiring"],
  },
  {
    id: "SP-017",
    slug: "session-pinner",
    size: "M",
    review: 2,
    score: "4/8",
    assessment: "Session pinner core and Step 3 lookup.",
    mission: "Session pinner with break rules and Step 3 pin lookup. Maps to T033, T034 (FR-006, FR-007, FR-008).",
    deps: ["SP-016"],
    context: ["specs/001-build-smart-router/spec.md (US4)"],
    scope: ["src/domain/pinning/session-pinner.ts", "src/domain/pipeline/router-pipeline.ts"],
    mustChange: "src/domain/pinning/session-pinner.ts",
    mustNotChange: "src/domain/triage/turn-envelope.ts",
    criteria: "Pin lookup <1ms; break rules exhaustive.",
    steps: [
      { title: "Session pinner", items: ["T033: session-pinner.ts (FR-006, FR-007, FR-008)", "T034: Step 3 pin lookup + persistence; Step 3b stub until SP-030"] },
    ],
    doNot: ["Implement cache economics (SP-018)"],
  },
  {
    id: "SP-018",
    slug: "pinning-cache-tests",
    size: "M",
    review: 2,
    score: "4/8",
    assessment: "Cache economics, FR-023 markers, pinning tests.",
    mission: "Cache-warmup economics, provider cache markers, FR-007 negative tests. Maps to T035, T036, T037, T038.",
    deps: ["SP-017"],
    context: ["specs/001-build-smart-router/spec.md (FR-023, SC-006)"],
    scope: ["src/domain/pinning/cache-economics.ts", "src/infrastructure/gateway/gateway-dispatch.ts", "tests/unit/session-pinner.test.ts", "tests/integration/session-pinning.test.ts"],
    mustChange: "src/domain/pinning/cache-economics.ts",
    mustNotChange: "src/domain/triage/**",
    criteria: "Multi-turn pin stability; FR-007 skip re-match on pin hits.",
    steps: [
      { title: "Cache and tests", items: ["T035: cache-economics.ts", "T036: Preserve cache markers (FR-023)", "T037: Unit tests incl. FR-007 negative", "T038: session-pinning integration test"] },
    ],
    doNot: ["Implement turn envelope (SP-021)"],
  },
  {
    id: "SP-019",
    slug: "local-probes",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Hardware probe and local service pings.",
    mission: "Hardware probe and LM Studio/Ollama readiness pings. Maps to T044, T045.",
    deps: ["SP-018"],
    context: ["specs/001-build-smart-router/data-model.md", "specs/001-build-smart-router/spec.md (US5)"],
    scope: ["src/infrastructure/hardware/hardware-probe.ts", "src/infrastructure/local/local-zero-tier.ts"],
    mustChange: "src/infrastructure/hardware/hardware-probe.ts, src/infrastructure/local/local-zero-tier.ts",
    mustNotChange: "src/domain/pipeline/router-pipeline.ts",
    criteria: "Probe returns full_local, classification_only, or disabled; pings under 15ms combined.",
    steps: [
      { title: "Probes", items: ["T044: hardware-probe.ts three-state gate", "T045: LM Studio + Ollama readiness pings"] },
    ],
    doNot: ["Integrate pipeline Steps 1+4 (SP-020)"],
  },
  {
    id: "SP-020",
    slug: "local-pipeline",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Local tier pipeline integration and tests.",
    mission: "Integrate Steps 1+4 and local tier unit tests. Maps to T046, T047.",
    deps: ["SP-019"],
    context: ["src/infrastructure/hardware/hardware-probe.ts"],
    scope: ["src/domain/pipeline/router-pipeline.ts", "tests/unit/local-zero-tier.test.ts"],
    mustChange: "src/domain/pipeline/router-pipeline.ts (Steps 1 and 4 only)",
    mustNotChange: "src/domain/matching/**",
    criteria: "Classification-only MUST NOT dispatch full local; SC-007.",
    steps: [
      { title: "Integration and tests", items: ["T046: Steps 1+4 integration", "T047: 8GB/16GB/battery/unreachable tests"] },
    ],
    doNot: ["Modify hardware-probe.ts except wiring"],
  },
  {
    id: "SP-021",
    slug: "turn-classifier",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Turn envelope classifier module.",
    mission: "Turn envelope classifier (<2ms budget). Maps to T029.",
    deps: ["SP-020"],
    context: ["specs/001-build-smart-router/contracts/pi-middleware.md"],
    scope: ["src/domain/triage/turn-envelope.ts"],
    mustChange: "src/domain/triage/turn-envelope.ts",
    mustNotChange: "src/domain/pipeline/router-pipeline.ts",
    criteria: "turn_type enum derived from message envelope.",
    steps: [
      { title: "Classifier", items: ["T029: turn-envelope.ts classifier"] },
    ],
    doNot: ["Integrate pipeline (SP-022)"],
  },
  {
    id: "SP-022",
    slug: "turn-pipeline",
    size: "S",
    review: 1,
    score: "2/8",
    assessment: "Step 2b pipeline hook only.",
    mission: "Integrate Step 2b turn envelope into pipeline. Maps to T030.",
    deps: ["SP-021"],
    context: ["src/domain/triage/turn-envelope.ts"],
    scope: ["src/domain/pipeline/router-pipeline.ts"],
    mustChange: "src/domain/pipeline/router-pipeline.ts (Step 2b only)",
    mustNotChange: "src/domain/pinning/sub-route-policy.ts",
    criteria: "Step 2b runs after Step 2 within budget.",
    steps: [
      { title: "Pipeline hook", items: ["T030: Step 2b integration"] },
    ],
    doNot: ["Implement sub-route policy (SP-023)"],
  },
  {
    id: "SP-023",
    slug: "sub-route-policy",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Same-provider sub-routing policy and tests.",
    mission: "Same-provider economical sub-routing and unit tests. Maps to T031, T032 (FR-024).",
    deps: ["SP-022"],
    context: ["specs/001-build-smart-router/spec.md (FR-024)"],
    scope: ["src/domain/pinning/sub-route-policy.ts", "tests/unit/turn-envelope.test.ts"],
    mustChange: "src/domain/pinning/sub-route-policy.ts",
    mustNotChange: "src/domain/matching/**",
    criteria: "Sub-routing respects size threshold and provider match.",
    steps: [
      { title: "Sub-route and tests", items: ["T031: sub-route-policy.ts", "T032: turn-envelope.test.ts"] },
    ],
    doNot: ["Modify session-pinner break rules"],
  },
  {
    id: "SP-024",
    slug: "telemetry",
    size: "S",
    review: 1,
    score: "2/8",
    assessment: "Routing telemetry emitter.",
    mission: "Routing telemetry with 168h/1111 rolling window and Step 7 emit. Maps to T039, T040.",
    deps: ["SP-023"],
    context: ["specs/001-build-smart-router/data-model.md"],
    scope: ["src/infrastructure/telemetry/routing-telemetry.ts", "src/domain/pipeline/router-pipeline.ts"],
    mustChange: "src/infrastructure/telemetry/routing-telemetry.ts",
    mustNotChange: "src/api/explain/**",
    criteria: "Rolling window enforced; Step 7 emits telemetry.",
    steps: [
      { title: "Telemetry", items: ["T039: routing-telemetry.ts", "T040: Step 7 wire in pipeline"] },
    ],
    doNot: ["Implement explain handler (SP-025)"],
  },
  {
    id: "SP-025",
    slug: "explain-handler",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Explain endpoint without upstream dispatch.",
    mission: "Explain handler per explain-endpoint.md — no inference, no upstream-cost telemetry. Maps to T041.",
    deps: ["SP-024"],
    context: ["specs/001-build-smart-router/contracts/explain-endpoint.md"],
    scope: ["src/api/explain/router-explain.ts"],
    mustChange: "src/api/explain/router-explain.ts",
    mustNotChange: "src/domain/matching/**",
    criteria: "Returns tier/stage/reason/alternatives without dispatch.",
    steps: [
      { title: "Explain handler", items: ["T041: router-explain.ts per contract"] },
    ],
    doNot: ["Dispatch upstream inference on explain path"],
  },
  {
    id: "SP-026",
    slug: "explain-tests",
    size: "S",
    review: 1,
    score: "2/8",
    assessment: "Explain contract and parity tests.",
    mission: "Explain contract test and explain vs live parity test. Maps to T042, T043 (SC-010).",
    deps: ["SP-025"],
    context: ["specs/001-build-smart-router/contracts/explain-endpoint.md"],
    scope: ["tests/contract/explain-endpoint.test.ts", "tests/integration/explain-parity.test.ts"],
    mustChange: "tests/contract/explain-endpoint.test.ts",
    mustNotChange: "src/domain/matching/**",
    criteria: "Explain vs live path produce identical decisions (SC-010).",
    steps: [
      { title: "Tests", items: ["T042: explain-endpoint contract test", "T043: explain-parity integration test"] },
    ],
    doNot: ["Modify explain handler unless tests require"],
  },
  {
    id: "SP-027",
    slug: "hydra-matcher",
    size: "M",
    review: 3,
    score: "6/8",
    assessment: "HyDRA embedding matcher with ONNX.",
    mission: "HyDRA embedding matcher with shortfall scoring and mocked unit tests. Maps to T048.",
    deps: ["SP-026"],
    context: ["specs/001-build-smart-router/research.md", "specs/001-build-smart-router/quickstart.md"],
    scope: ["src/domain/matching/hydra-matcher.ts", "tests/unit/hydra-matcher.test.ts"],
    mustChange: "src/domain/matching/hydra-matcher.ts",
    mustNotChange: "src/infrastructure/gateway/circuit-breaker.ts",
    criteria: "ONNX from artifact path; 80–120ms budget; shortfall gate.",
    steps: [
      { title: "Matcher", items: ["T048: hydra-matcher.ts with shortfall scoring", "Mocked unit tests; no weights in git"] },
    ],
    doNot: ["Implement multi-objective scoring (SP-028)"],
  },
  {
    id: "SP-028",
    slug: "multi-objective",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Multi-objective cost/latency/verbosity scoring.",
    mission: "Multi-objective score consuming frugality.lambda_* config. Maps to T049 (FR-021).",
    deps: ["SP-027"],
    context: ["src/config/defaults.ts"],
    scope: ["src/domain/scoring/multi-objective.ts"],
    mustChange: "src/domain/scoring/multi-objective.ts",
    mustNotChange: "src/domain/matching/hydra-matcher.ts",
    criteria: "Score uses lambda_cost, lambda_latency, lambda_verbosity.",
    steps: [
      { title: "Scoring", items: ["T049: multi-objective.ts"] },
    ],
    doNot: ["Integrate pipeline Step 5 (SP-029)"],
  },
  {
    id: "SP-029",
    slug: "matcher-pipeline",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Step 5 pipeline hook only.",
    mission: "Integrate Step 5 HyDRA matcher for ambiguous prompts. Maps to T050.",
    deps: ["SP-028"],
    context: ["src/domain/matching/hydra-matcher.ts"],
    scope: ["src/domain/pipeline/router-pipeline.ts"],
    mustChange: "src/domain/pipeline/router-pipeline.ts (Step 5 only)",
    mustNotChange: "src/domain/matching/hydra-matcher.ts",
    criteria: "Ambiguous prompts route through Step 5 matcher.",
    steps: [
      { title: "Pipeline hook", items: ["T050: Step 5 integration"] },
    ],
    doNot: ["Implement loop escalation (SP-030)"],
  },
  {
    id: "SP-030",
    slug: "loop-escalation",
    size: "M",
    review: 2,
    score: "4/8",
    assessment: "Loop escalation and Step 3b integration.",
    mission: "Loop escalation for identical tool failures and Step 3b pipeline hook. Maps to T051, T052 (FR-014).",
    deps: ["SP-029"],
    context: ["specs/001-build-smart-router/spec.md (FR-014, FR-008)"],
    scope: ["src/domain/pinning/loop-escalation.ts", "src/domain/pipeline/router-pipeline.ts"],
    mustChange: "src/domain/pinning/loop-escalation.ts",
    mustNotChange: "src/infrastructure/pricing/**",
    criteria: "Escalation fires once per session; Step 3b after Step 3.",
    steps: [
      { title: "Loop escalation", items: ["T051: loop-escalation.ts", "T052: Step 3b integration in pipeline"] },
    ],
    doNot: ["Implement pricing (SP-031)"],
  },
  {
    id: "SP-031",
    slug: "pricing-engine",
    size: "M",
    review: 2,
    score: "4/8",
    assessment: "Price broker and staleness monitor.",
    mission: "Price broker (override → registry → fallback) and staleness warning. Maps to T053, T054 (FR-019, FR-020).",
    deps: ["SP-030"],
    context: ["specs/001-build-smart-router/spec.md (FR-019, FR-020)"],
    scope: ["src/infrastructure/pricing/price-broker.ts", "src/infrastructure/pricing/pricing-monitor.ts"],
    mustChange: "src/infrastructure/pricing/price-broker.ts",
    mustNotChange: "src/infrastructure/gateway/gateway-dispatch.ts",
    criteria: "Tri-tier price resolution; 14-day staleness warning.",
    steps: [
      { title: "Pricing", items: ["T053: price-broker.ts", "T054: pricing-monitor.ts"] },
    ],
    doNot: ["Implement gateway resilience (SP-032)"],
  },
  {
    id: "SP-032",
    slug: "gateway-resilience",
    size: "M",
    review: 3,
    score: "5/8",
    assessment: "Circuit breaker, failover, rate limiting.",
    mission: "Circuit breaker, gateway failover chains, per-key rate limits with 429 response. Maps to T055, T056, T057.",
    deps: ["SP-031"],
    context: ["specs/001-build-smart-router/data-model.md", "specs/001-build-smart-router/spec.md (FR-017, FR-018)"],
    scope: ["src/infrastructure/gateway/circuit-breaker.ts", "src/infrastructure/gateway/gateway-dispatch.ts", "src/infrastructure/persistence/sqlite-store.ts", "src/domain/pipeline/router-pipeline.ts"],
    mustChange: "src/infrastructure/gateway/gateway-dispatch.ts",
    mustNotChange: "src/domain/matching/hydra-matcher.ts",
    criteria: "Infra-only failover; 429 + Retry-After on rate limit.",
    steps: [
      { title: "Gateway resilience", items: ["T055: circuit-breaker.ts (infra errors only)", "T056: Weighted distribution + failover", "T057: Rate limiting with 429/retry-after body"] },
    ],
    doNot: ["Modify HyDRA matcher core"],
  },
  {
    id: "SP-033",
    slug: "resilience-tests",
    size: "S",
    review: 2,
    score: "3/8",
    assessment: "Resilience unit tests.",
    mission: "Unit tests for loop escalation, circuit breaker, rate limit races. Maps to T058.",
    deps: ["SP-032"],
    context: ["tests/unit/resilience.test.ts"],
    scope: ["tests/unit/resilience.test.ts"],
    mustChange: "tests/unit/resilience.test.ts",
    mustNotChange: "src/domain/matching/hydra-matcher.ts",
    criteria: "429 + retry guidance fields asserted; seeded RNG for matcher tests.",
    steps: [
      { title: "Resilience tests", items: ["T058: resilience.test.ts"] },
    ],
    doNot: ["Refactor production modules unless test failures require"],
  },
  {
    id: "SP-034",
    slug: "stet-guardrails",
    size: "S",
    review: 1,
    score: "2/8",
    assessment: "Finalize stet guardrails.",
    mission: "Finalize .stet.yaml rules extending T006 skeleton. Maps to T059.",
    deps: ["SP-016", "SP-020", "SP-023", "SP-026", "SP-033"],
    context: [".stet.yaml", "specs/001-build-smart-router/plan.md"],
    scope: [".stet.yaml"],
    mustChange: ".stet.yaml",
    mustNotChange: "src/domain/**",
    criteria: "Zero-crash, no any, triage bounds, no I/O in loops rules finalized.",
    steps: [
      { title: "Stet rules", items: ["T059: Finalize .stet.yaml guardrails"] },
    ],
    doNot: ["Duplicate guardrails from T006 skeleton"],
  },
  {
    id: "SP-035",
    slug: "benchmarks-e2e",
    size: "M",
    review: 2,
    score: "4/8",
    assessment: "E2E and performance benchmarks.",
    mission: "Full pipeline E2E, SC-005 latency benchmark, SC-009 cost baseline. Maps to T060, T061, T062.",
    deps: ["SP-034"],
    context: ["specs/001-build-smart-router/spec.md (SC-005, SC-009)"],
    scope: ["tests/integration/full-pipeline.test.ts", "tests/integration/routing-latency.test.ts", "tests/integration/cost-baseline.test.ts"],
    mustChange: "tests/integration/full-pipeline.test.ts",
    mustNotChange: "src/domain/**",
    criteria: "SC-005 median <200ms; SC-009 cost baseline test exists.",
    steps: [
      { title: "E2E and benchmarks", items: ["T060: full-pipeline.test.ts", "T061: routing-latency.test.ts (<200ms)", "T062: cost-baseline.test.ts"] },
    ],
    doNot: ["Change production code except bugfixes for failing tests"],
  },
  {
    id: "SP-036",
    slug: "quickstart-gate",
    size: "S",
    review: 0,
    score: "1/8",
    assessment: "Docs sync and gate evidence.",
    mission: "Update quickstart with install/run commands and document gate evidence. Maps to T063, T064.",
    deps: ["SP-035"],
    context: ["specs/001-build-smart-router/quickstart.md"],
    scope: ["specs/001-build-smart-router/quickstart.md"],
    mustChange: "specs/001-build-smart-router/quickstart.md",
    mustNotChange: "src/**",
    criteria: "Quickstart reflects actual commands; typecheck+test evidence documented.",
    steps: [
      { title: "Docs and evidence", items: ["T063: Update quickstart.md", "T064: Run npm run typecheck && npm test; document results"] },
    ],
    doNot: ["Add new features beyond T063/T064"],
  },
];

function prompt(p) {
  const steps = p.steps
    .map(
      (s, i) => `### Step ${i + 1}: ${s.title}

${s.items.map((item) => `- [ ] ${item}`).join("\n")}`
    )
    .join("\n\n");
  const stepNum = p.steps.length + 1;
  return `# Task: ${p.id} — ${p.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}

**Created:** 2026-07-02
**Size:** ${p.size}

## Review Level: ${p.review}

**Assessment:** ${p.assessment}
**Score:** ${p.score}

## Mission

${p.mission}

## Dependencies

${p.deps.length === 0 ? "- **None**" : p.deps.map((d) => `- ${d}`).join("\n")}

## Context to Read First

${p.context.map((c) => `- \`${c}\``).join("\n")}

## Environment

- **Test command:** \`npm run typecheck && npm test\`

## File Scope

${p.scope.map((s) => `- \`${s}\``).join("\n")}

## Contract

| Field | Value |
|-------|-------|
| testCommand | \`npm run typecheck && npm test\` |
| fileScopeMustChange | ${p.mustChange.split(", ").map((s) => `\`${s}\``).join(", ")} |
| fileScopeMustNotChange | ${p.mustNotChange.split(", ").map((s) => `\`${s}\``).join(", ")} |
| completionCriteria | ${p.criteria} |

## Steps

${steps}

### Step ${stepNum}: Testing and verification

- [ ] Run \`npm run typecheck && npm test\`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- \`feat(${p.id}): description\`

## Do NOT

${p.doNot.map((d) => `- ${d}`).join("\n")}

---

## Amendments (Added During Execution)
`;
}

function status(p) {
  const stepBlocks = p.steps
    .map(
      (s, i) => `## Step ${i + 1}: ${s.title}

**Status:** Not Started

${s.items.map((item) => `- [ ] ${item}`).join("\n")}`
    )
    .join("\n\n");
  const testStep = p.steps.length + 1;
  return `**Current Step:** Step 1: Not started
**Status:** Ready
**Last Updated:** 2026-07-02
**Review Level:** ${p.review}
**Size:** ${p.size}

---

${stepBlocks}

## Step ${testStep}: Testing and verification

**Status:** Not Started

- [ ] Run \`npm run typecheck && npm test\`

---

## Notes

${p.id} (${p.size}) — ${p.slug}
`;
}

for (const p of packets) {
  const dir = join(root, `${p.id}-${p.slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "PROMPT.md"), prompt(p));
  writeFileSync(join(dir, "STATUS.md"), status(p));
}

const edges = [];
for (const p of packets) {
  for (const dep of p.deps) {
    edges.push({ from: p.id, to: dep });
  }
}
writeFileSync(join(root, "dependencies.json"), JSON.stringify({ edges }, null, 2) + "\n");
console.log(`Generated ${packets.length} packets, ${edges.length} dependency edges`);
