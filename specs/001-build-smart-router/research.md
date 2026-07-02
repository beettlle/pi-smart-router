# Research: Auto-Model Router MVP

**Feature**: 001-build-smart-router | **Date**: 2026-07-02  
**Sources**: [docs/PRD.md](../../docs/PRD.md), [docs/deep-research.md](../../docs/deep-research.md), [spec.md](./spec.md)

## 1. Runtime & Package Layout

**Decision**: TypeScript 5.x strict, Node.js 20 LTS, ES modules, single `src/` package published to npm.  
**Rationale**: pi.dev ecosystem is Node/TS; constitution mandates strict TS and ES modules. Greenfield repo has no existing layout.  
**Alternatives considered**: Go proxy (Weave pattern) — rejected; pi-native middleware integration favors TS library.

## 2. Session Store

**Decision**: Redis via `ioredis` for production/multi-instance; in-memory `Map` fallback when `REDIS_URL` unset (single-user dev).  
**Rationale**: Spec assumption: centralized store optional for dev, recommended for distributed rate limiting. PRD §3 Step 3 requires atomic pin state.  
**Alternatives considered**: SQLite-only — rejected for rate-limit Lua scripts; PostgreSQL — overkill for MVP.

## 3. Lexical Triage

**Decision**: `aho-corasick-node` for O(n+m+z) multi-keyword scan; confounder regex sanitization before scan.  
**Rationale**: deep-research §Deterministic heuristics; PRD Step 2 <5ms budget.  
**Alternatives considered**: Iterating hundreds of RegExp — rejected (linear pattern count).

## 4. AST Complexity

**Decision**: `@typescript-eslint/parser` with `tolerate: true`; cyclomatic threshold 15 → frontier tier.  
**Rationale**: PRD Step 2; deep-research AST section (2–10ms overhead acceptable).  
**Alternatives considered**: Full ESLint run — too heavy; espree-only — weaker TS support.

## 5. Embedding Matcher (HyDRA)

**Decision**: `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2` (384-dim) via ONNX/WASM; project to [Req_Reasoning, Req_CodeGen, Req_ToolUse]; shortfall + multi-objective score.  
**Rationale**: PRD Step 5; constitution ML path (shape validation, no weights in git). Fleet decoupled via models.yaml capabilities.  
**Alternatives considered**: OpenAI embeddings API — network latency violates TTFT; RL trace router — deferred Phase 2.

## 6. Local Backends

**Decision**: LM Studio primary (`GET localhost:1234/v1/models`), Ollama secondary (`GET localhost:11434/api/ps`); no cold-start dispatch.  
**Rationale**: PRD Step 4; spec FR-013.  
**Alternatives considered**: MLX native — Phase 2 (PRD §5.1).

## 7. Hardware Gating

**Decision**: `os.totalmem()` ≥16GB for full local; 8GB classification-only; battery <20% unplugged disables local.  
**Rationale**: PRD Step 1; spec edge cases.  
**Alternatives considered**: GPU detection — defer; macOS `sysctl` for memory confirmation in hardware-probe.

## 8. Rate Limiting & Failover

**Decision**: Redis Token Bucket via Lua `EVAL`; circuit breaker 30s cooldown on 5xx only; weighted round-robin with latency-quality matching.  
**Rationale**: deep-research §System Optimization; PRD Step 6.  
**Alternatives considered**: In-memory token bucket — race conditions in multi-instance.

## 9. Pricing Engine

**Decision**: Priority: operator override → LiteLLM JSON (24h cron) → models.yaml fallback; 14-day staleness reminder.  
**Rationale**: PRD §4 Tri-Tier Price Engine; spec FR-019–020.  
**Alternatives considered**: Hardcoded prices only — insufficient for volatile LLM pricing.

## 10. Turn Envelope (pi.dev integration)

**Decision**: Classify `turn_type` enum: `planning | tool_result | subagent | main_loop | unknown` from message role, tool-call blocks, payload size. Exact pi hook fields to be confirmed during Lane 4.1 integration spike.  
**Rationale**: PRD Step 2b; Weave production pattern.  
**Alternatives considered**: Text-only routing — rejected per spec US3.

## 11. Observability

**Decision**: Structured JSON logs per request; `POST /v1/route/explain` + `pi router explain` CLI; optional OTLP export hook (stretch).  
**Rationale**: PRD Step 7; spec US6, FR-015–016.  
**Alternatives considered**: Logs only — insufficient for SC-008/010.

## 12. Testing Stack

**Decision**: Vitest + zod schema tests + mocked Redis/local HTTP; spine gates: `npm run typecheck && npm test`.  
**Rationale**: spine-config.json testing block; constitution error-path coverage.  
**Alternatives considered**: Jest — either acceptable; Vitest chosen for ESM-native speed.

## 13. Safe Cloud Default

**Decision**: On any routing failure, select first healthy model from `economical-cloud` tier in models.yaml; if none, first `frontier-cloud` entry. Never throw to host agent.  
**Rationale**: FR-022, constitution VI.  
**Alternatives considered**: Always frontier — cost-prohibitive; hardcoded model ID — violates fleet decoupling.

## 14. Deferred (Phase 2)

| Topic | Rationale |
|-------|-----------|
| RL-trained router | PRD §2.3, spec Out of Scope |
| Semantic caching | PRD §5.4 |
| MLX / CUDA native | PRD Phase 2 |
| Cross-format API translation | MVP same-provider paths only |
