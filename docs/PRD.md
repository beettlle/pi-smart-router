# Product Requirements Document: pi-smart-router

**Auto-Model Router for pi.dev**

## 1. Executive Summary

**Objective:** Develop pi-smart-router, an open-source, ultra-low-latency model routing package for the pi.dev coding agent ecosystem. This package dynamically intercepts LLM inference requests and routes them to the optimal execution engine (Local Zero-Tier, Cheap Cloud, or Frontier Cloud) to balance cost, capability, and Time-To-First-Token (TTFT) without requiring manual developer intervention.

**MVP Scope:** The initial release prioritizes local development on macOS (Apple Silicon). It utilizes LM Studio as the primary local HTTP backend, with Ollama as the secondary fallback. Future phases will introduce native Apple MLX frameworks, followed by NVIDIA CUDA integration for Windows/Linux.

## 2. Deep Research Lineage & Architectural Justification

A coding agent implementing this system must understand the specific research architectures we are adapting and the pitfalls we are explicitly avoiding.

### 2.1. Rejected Frameworks & Pitfalls

**Rejected: FrugalGPT (Sequential Cascading)**

Cascading frameworks rely on a "Generation Judger" evaluating a cheap model's output after it generates, escalating to an expensive model on failure.

- **Decision:** This introduces severe tail latencies (20s+ on complex code). Our routing must be purely predictive (pre-generation).
- **Allowed (distinct from FrugalGPT):** Observational loop escalation — detect repeated identical tool failures or edit-loop signatures at runtime and escalate the session pin to a frontier tier. The trigger is telemetry-based, not a second inference to judge output quality.

**Rejected: RouteLLM (Matrix Factorization)**

While RouteLLM predicts model success via binary human preference, it is highly vulnerable to "LLM Control Plane Integrity" attacks. Malicious confounder tokens (invisible junk strings in repos) trick the router into overestimating complexity.

- **Decision:** We must strictly enforce input regex sanitization before routing.

**Rejected: Turn-by-Turn Dynamic Routing**

Constantly switching models mid-session shatters provider-side Prompt Prefix Caching (Anthropic/OpenAI caching). Rebuilding a 100k context window costs more than routing saves.

- **Decision:** We mandate Cache-Aware Session Pinning.
- **Rejected:** Re-optimizing provider/model on every turn (naive per-request routing).
- **Allowed:** Turn-type-aware tier hints **within** a pinned session (e.g., `tool_result` payloads may use an economical path when pin policy permits sub-routing). Sub-routing must not break provider cache markers or cross providers without accounting for cache-warmup cost.

### 2.2. Adopted Architectures

**Adopted: GitHub Copilot HyDRA (Shortfall Matching)**

HyDRA decouples routing weights from model identities. It predicts a prompt's multi-dimensional requirements (Reasoning, CodeGen, ToolUse) and matches them against a static YAML configuration.

- **Decision:** This allows developers to swap new underlying models in `models.yaml` without retraining the embedding layer.

**Adopted: The "Zero-Tier" Local Edge-Cache**

Open-weight models (Gemma 4 7B, Qwen 3.5) are free but computationally heavy.

- **Decision:** We treat local models purely as an edge-cache for high-frequency, low-complexity tasks (JSON formatting, typo fixes), gated by explicit unified memory checks and VRAM polling.

### 2.3. Production Router Reference (Weave)

[Weave Router](https://github.com/workweave/router) validates agentic routing in production: session pinning to preserve prompt-cache economics, multi-objective selection (cost + latency + verbosity at quality parity), and per-request telemetry. Internal claims cite 40–85% cost reduction vs. always-frontier baselines on coding-agent workloads.

**Patterns we adopt:**

- Pin economics: session sticks to first routing decision; switches only when cache-warmup cost is offset by savings.
- Turn-type signals: classify agentic turn context (planning, tool result, subagent exploration) before neural matching.
- Loop escalation: observational rescue when cheap models cycle on identical tool failures.
- Explain endpoint: return routing rationale without upstream dispatch (shadow runs, operator trust).
- Per-request telemetry: decision stage, reason code, estimated cost, routing latency.

**Patterns we reject or defer:**

- RL-trained routers on agent traces (defer to Phase 2).
- Managed-only provider sprawl (pi-smart-router stays self-hosted and pi-native).
- Semantic caching per intent cluster (defer to Phase 2).

pi-smart-router remains open-source. Local zero-tier with cold-start gating, sub-5ms deterministic triage, confounder sanitization, and HyDRA fleet decoupling are differentiators Weave does not emphasize.

## 3. The Multi-Tiered Architecture Pipeline

The router operates as a strict, synchronous pipeline. Downstream tiers are bypassed the microsecond a routing decision is reached.

### Step 1: Hardware & Environment Probing (Initialization)

Local models cannot be blindly invoked. The system profiles the host machine at startup via Node's `os` and `child_process` modules.

- **OS Check:** Identify Darwin (macOS).
- **Unified Memory Rule:** Query `os.totalmem()`. Require >= 16GB for full local routing. (8GB limits local execution to classification-only triage to prevent OS thrashing).
- **Power Rule:** If `isPluggedIn == false` AND `batteryLevel < 20%`, force `LOCAL_TIER_ENABLED = false` to preserve the user's battery.

### Step 2: Deterministic Triage & Static Analysis (Latency Budget: < 5ms)

Bypass neural inference entirely using high-speed heuristics executing on the Node event loop.

- **Sanitization:** Apply regex to strip repeating non-alphanumeric token sequences (confounder attack prevention).
- **Aho-Corasick Lexical Scanner:** Compile a finite state machine using `aho-corasick-node` (O(n+m+z) time complexity). Map intents:
  - **Cheap/Local:** "format", "lint", "jsdoc", "regex", "unit test".
  - **Frontier:** "race condition", "memory leak", "architecture", "system design".
- **AST Complexity Parsing:** Extract Markdown code blocks. Feed them into `@typescript-eslint/parser` (configured with `tolerate: true`).
  - Traverse the ESTree. Increment a counter for every control flow node (`IfStatement`, `ForStatement`, `ConditionalExpression`, `SwitchCase`, `LogicalExpression`).
  - If `cyclomatic_score > 15`, immediately route to the Frontier Cloud tier.

### Step 2b: Agentic Turn Envelope Analysis (Latency Budget: < 2ms)

Parse the pi request envelope (role, tool-call presence, message structure, approximate payload size) before session pinning or neural matching.

| Signal | Routing implication |
|--------|---------------------|
| `tool_result` / small structured payload | Candidate for economical tier even when session is pinned to frontier for planning |
| `planning` / long user prompt / architecture keywords | Frontier bias before pin applies |
| `subagent` / exploration metadata | Mid-tier bias |
| Same-format upstream path | Skip unnecessary serialization (lazy envelope) |

Turn-type classification aligns with production router telemetry (`turn_type`); exact pi.dev metadata fields to be confirmed during `/spec:plan`.

### Step 3: Cache-Aware Session Pinning (Latency Budget: < 1ms)

Preserve provider-side context caching.

- **Logic:** Query session pin from the SQLite state store by `sessionId`. If a valid `pinnedModel` exists, and no pin-break condition applies, bypass Steps 4 and 5 and route to the pinned model.
- **Pin immutability:** Once pinned, the scorer does not re-run full Step 5 on every turn unless a break condition fires.

**Pin break conditions (exhaustive):**

1. History compaction / truncation flag on the payload.
2. User explicit model override (`pi config force-model` equivalent).
3. Qualified loop escalation (see Step 3b).
4. Cache-warmup economics: switch only when `estimated_savings > cache_reprime_cost` over remaining session turns.

**Session pin fields:** `pin_reason`, `has_ever_switched`, `consecutive_upstream_errors` (persisted in SQLite; in-memory store for unit tests only).

### Step 3b: Loop Escalation Pin

Detect bounded failure patterns within a session window:

- N identical tool failures (default N = 3).
- Repeated edit-loop signatures or spiral signals.

**Action:** Set `pinnedModel` to frontier tier; `pin_reason = loop_escalation`; pin is immutable for the session remainder (same stickiness as user force). This is observational rescue, not post-generation output judging.

### Step 4: Local Zero-Tier Execution (The Cold-Start Solution)

If the hardware probe passes and the task is trivial, cascade through local HTTP backends. A cold start takes 2–5 seconds, which destroys TTFT. We must strictly ping active VRAM.

- **LM Studio (Primary):** Ping `GET http://localhost:1234/v1/models`. If the target model ID is present in the `data` array (actively loaded), instantly dispatch to `/v1/chat/completions`.
- **Ollama (Secondary):** Ping `GET http://localhost:11434/api/ps`. If the model is listed, dispatch to Ollama, overriding with `"keep_alive": "5m"` to retain it in VRAM.
- **Cloud Fallback:** If neither service has the model actively loaded, do not trigger an inference request. Instantly fall back to the Cheap Cloud tier. (Target timeout budget for both pings: < 15ms).

### Step 5: Predictive Multi-Dimensional Matching (Latency Budget: 80–120ms)

For ambiguous queries that fail deterministic triage.

- **Local Embedding:** Use `@huggingface/transformers` to run `Xenova/all-MiniLM-L6-v2` via ONNX/WASM. Extract the 384-dimensional vector representation.
- **Requirement Mapping:** Project the vector into a 3D requirement space: `[Req_Reasoning, Req_CodeGen, Req_ToolUse]`.

### Step 6: Resilient Gateway Dispatch

- **Rate Limiting:** Execute Token Bucket limits using `better-sqlite3` with atomic `BEGIN IMMEDIATE` transactions (read → refill → deduct in one commit). Shared across single-host multi-process runs (e.g., pi-spine workers). Do not use per-process memory variables for production rate limits.
- **Load Balancing:** Distribute traffic across identical model endpoints using Weighted Round-Robin based on Latency-Quality Matching.
- **Circuit Breaking:** On HTTP 5xx errors, trip the breaker, start a 30-second cooldown, and seamlessly replay the payload against the next model in the fallback chain. (Do not fallback on 4xx user/safety errors).
- **Format preservation:** Same-provider paths MUST preserve provider cache markers (`cache_control`, extended thinking blocks, tool payloads). Cross-format translation (if ever added) uses a canonical intermediate representation; never strip cache hints silently.

### Step 7: Routing Observability

**Explain / shadow endpoint:**

- `POST /v1/route/explain` or pi CLI `pi router explain` — returns `{tier, model, stage, reason_code, candidates, estimated_cost}` without upstream dispatch.
- Use for shadow runs, eval pipelines, and operator trust.

**Per-request telemetry** (emit on every routed request):

- `session_id`, `stage`, `reason_code`, `turn_type`, `candidates_considered`, `estimated_cost`, `routing_latency_ms`, `pin_reason`
- Optional OTLP export for dashboards.

## 4. Mathematical Models & The Tri-Tier Price Engine

LLM pricing is highly volatile. pi-smart-router implements a background pricing engine and calculates cost-efficiency dynamically using a FrugalGPT-derived formula.

### The Tri-Tier Pricing Priority

To determine a model's exact `cost_per_1m`, the router checks:

1. **User Overrides:** Explicit hardcoded limits set via `pi config set-price`.
2. **Async Broker Cache:** A background cron worker (`price-broker.ts`) fetches the LiteLLM pricing JSON from GitHub every 24 hours and caches it in the SQLite state store.
3. **YAML Fallback:** The static baseline defined in `models.yaml`.

### The Agentic Reminder Loop

On initialization, the `pricing-monitor.ts` middleware checks the `last_updated` timestamp of the price cache.

If `last_updated > 14 days`, it injects a proactive warning via the pi agent:

> "Hey, your LLM pricing cache hasn't updated in 14 days. Should I fetch the latest rates or do you want to input them manually?"

### The HyDRA Multi-Objective Scoring

Once the vectors are embedded, the router iterates over `models.yaml`.

**Calculate Shortfall:**

```
Shortfall = max(0, Req_Reasoning - Model_Reasoning)
          + max(0, Req_CodeGen - Model_CodeGen)
          + ...
```

**Multi-Objective Score (quality parity gate, then optimize):**

Within each candidate set that meets the shortfall gate (quality parity), select the model that maximizes:

```
Score_i = (1 - Shortfall_i)
        - (λ_cost × NormalizedCost_i)
        - (λ_latency × NormalizedLatency_i)
        - (λ_verbosity × NormalizedVerbosity_i)
```

- `NormalizedLatency_i` from `models.yaml` `latency_p50_ms` or live telemetry EMA.
- `NormalizedVerbosity_i` from historical output-token ratio per model (catalog default; refine via telemetry).
- Quality-parity models can differ 3–5× in output tokens and seconds to TTFT; all three axes are first-class.

**Weight defaults:**

- `λ_cost` — from frugality slider (user-configurable).
- `λ_latency` — default `0.1`.
- `λ_verbosity` — default `0.15`.

**Frugality Slider (λ_cost):** If `λ_cost = 0.9`, the system aggressively penalizes cost. If `λ_cost = 0.1`, the system favors capability regardless of API price.

## 5. Configuration Schema (`models.yaml`)

```yaml
models:
  - id: local-gemma-4-7b
    tier: zero-tier
    provider: lmstudio
    capabilities:
      reasoning: 0.3
      code_gen: 0.6
      tool_use: 0.1
    performance:
      latency_p50_ms: 120
      verbosity_factor: 0.9
      cache_friendly: true
    pricing:
      registry_key: "local/free"
      user_override_cost: null
      fallback_cost_per_1m: 0.00

  - id: claude-3.5-sonnet
    tier: frontier-cloud
    provider: anthropic
    capabilities:
      reasoning: 0.95
      code_gen: 0.95
      tool_use: 0.95
    performance:
      latency_p50_ms: 450
      verbosity_factor: 1.2
      cache_friendly: true
    pricing:
      registry_key: "anthropic/claude-3-5-sonnet"
      user_override_cost: null
      fallback_cost_per_1m: 3.00
```

## 6. Implementation Matrix (pi-spine Task Breakdown)

### Lane 1: System Introspection & Heuristics

| Task | Description |
|------|-------------|
| **1.1** | `hardware-probe.ts` — Implement macOS checks (`sysctl` for unified memory) to determine `LOCAL_TIER_ENABLED`. |
| **1.2** | `triage-engine.ts` — Implement `aho-corasick-node` (intent scanning) and `@typescript-eslint/parser` (cyclomatic AST scoring with confounder sanitization). |
| **1.3** | `turn-envelope.ts` — Classify agentic turn type from pi request metadata (role, tool-call presence, payload size). |

### Lane 2: State, Cost & Gateway Resilience

| Task | Description |
|------|-------------|
| **2.1** | `session-pinner.ts` — SQLite persistence for pin break rules, cache-warmup economics, and loop escalation pin. |
| **2.2** | `gateway-dispatch.ts` — Token Bucket (SQLite transactions) & LQM Weighted Round-Robin. |
| **2.3** | `circuit-breaker.ts` — 5xx failovers and cooldown probes. |
| **2.4** | `price-broker.ts` — 24-hour background fetch caching LiteLLM pricing. |
| **2.5** | `pricing-monitor.ts` — 14-day agentic reminder loop. |
| **2.6** | `routing-telemetry.ts` — Structured per-decision logs; optional OTLP export. |

### Lane 3: Routing ML & Local HTTP Backends

| Task | Description |
|------|-------------|
| **3.1** | `hydra-matcher.ts` — ONNX runtime, Shortfall matching, and multi-objective score (latency + verbosity). |
| **3.2** | `local-zero-tier.ts` — Active memory cascading pings (LM Studio `/v1/models` → Ollama `/api/ps`). |

### Lane 4: Orchestration & SDD Guardrails (stet)

| Task | Description |
|------|-------------|
| **4.1** | `router-pipeline.ts` — Wire Lanes 1–3 sequentially. |
| **4.2** | `.stet.yaml` Configuration — Enforce zero-crash fallbacks (if local APIs or AST fail, default to cloud, never crash the IDE). Ban `any` types. Enforce <10ms latency bounds on regex triage. |
| **4.3** | `router-explain.ts` — Shadow/explain endpoint without upstream call. |
| **4.4** | `pi-router-install.ts` — One-command pi config wiring (stretch / post-MVP). |

### Phase 2 (Post-MVP): Native Backends & Advanced Routing

| Task | Description |
|------|-------------|
| **5.1** | Replace HTTP backends with Apple MLX native Node wrapper. |
| **5.2** | Integrate CUDA EP for `onnxruntime-node` (Windows/Linux). |
| **5.3** | RL-trained routing artifacts on agent traces. |
| **5.4** | Semantic caching per intent cluster. |
| **5.5** | Optional Redis store adapter for distributed multi-host deployments. |

### Storage (MVP)

Default state store: SQLite file at `.pi-smart-router/state.db` (project-relative), via `better-sqlite3` with WAL mode. Holds session pins, rate-limit buckets, price cache, and routing telemetry retention. No external server required. pi is single-host, multi-process — SQLite satisfies shared state across spine workers on the same machine.

## Appendix: Spec-Kit Setup

### 1. Install Spec-Kit CLI

Install the global toolkit via `uv`:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
```

### 2. Initialize the Repository

Create the project directory and run the initialization:

```bash
specify init pi-smart-router
```

### 3. Load the Specification

Use `/spec:specify` with a feature description derived from this PRD. Do **not** copy this PRD into `.specify/templates/`. Technical detail stays in PRD for `/spec:plan`; `specs/###-feature/spec.md` remains implementation-agnostic.

### 4. Run Spec-Driven Generation

Trigger your AI coding agent (e.g., inside pi.dev or Copilot) with `/spec:plan` to generate the file tree, followed by `/spec:tasks` to convert Section 6 into trackable implementation tickets.
