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

**Rejected: RouteLLM (Matrix Factorization)**

While RouteLLM predicts model success via binary human preference, it is highly vulnerable to "LLM Control Plane Integrity" attacks. Malicious confounder tokens (invisible junk strings in repos) trick the router into overestimating complexity.

- **Decision:** We must strictly enforce input regex sanitization before routing.

**Rejected: Turn-by-Turn Dynamic Routing**

Constantly switching models mid-session shatters provider-side Prompt Prefix Caching (Anthropic/OpenAI caching). Rebuilding a 100k context window costs more than routing saves.

- **Decision:** We mandate Cache-Aware Session Pinning.

### 2.2. Adopted Architectures

**Adopted: GitHub Copilot HyDRA (Shortfall Matching)**

HyDRA decouples routing weights from model identities. It predicts a prompt's multi-dimensional requirements (Reasoning, CodeGen, ToolUse) and matches them against a static YAML configuration.

- **Decision:** This allows developers to swap new underlying models in `models.yaml` without retraining the embedding layer.

**Adopted: The "Zero-Tier" Local Edge-Cache**

Open-weight models (Gemma 4 7B, Qwen 3.5) are free but computationally heavy.

- **Decision:** We treat local models purely as an edge-cache for high-frequency, low-complexity tasks (JSON formatting, typo fixes), gated by explicit unified memory checks and VRAM polling.

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

### Step 3: Cache-Aware Session Pinning (Latency Budget: < 1ms)

Preserve provider-side context caching.

- **Logic:** Query `redis.get(sessionId)` or a local memory map. If a valid `pinnedModel` exists, and the current payload lacks a history-truncation flag, bypass Steps 4 and 5 completely and route to the pinned model.

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

- **Rate Limiting:** Execute Token Bucket limits using `ioredis` with an atomic `EVAL` Lua script. Do not use local memory variables to prevent race conditions.
- **Load Balancing:** Distribute traffic across identical model endpoints using Weighted Round-Robin based on Latency-Quality Matching.
- **Circuit Breaking:** On HTTP 5xx errors, trip the breaker, start a 30-second cooldown, and seamlessly replay the payload against the next model in the fallback chain. (Do not fallback on 4xx user/safety errors).

## 4. Mathematical Models & The Tri-Tier Price Engine

LLM pricing is highly volatile. pi-smart-router implements a background pricing engine and calculates cost-efficiency dynamically using a FrugalGPT-derived formula.

### The Tri-Tier Pricing Priority

To determine a model's exact `cost_per_1m`, the router checks:

1. **User Overrides:** Explicit hardcoded limits set via `pi config set-price`.
2. **Async Broker Cache:** A background cron worker (`price-broker.ts`) fetches the LiteLLM pricing JSON from GitHub every 24 hours and caches it in Redis/SQLite.
3. **YAML Fallback:** The static baseline defined in `models.yaml`.

### The Agentic Reminder Loop

On initialization, the `pricing-monitor.ts` middleware checks the `last_updated` timestamp of the price cache.

If `last_updated > 14 days`, it injects a proactive warning via the pi agent:

> "Hey, your LLM pricing cache hasn't updated in 14 days. Should I fetch the latest rates or do you want to input them manually?"

### The HyDRA Cost-Weighted Math

Once the vectors are embedded, the router iterates over `models.yaml`.

**Calculate Shortfall:**

```
Shortfall = max(0, Req_Reasoning - Model_Reasoning)
          + max(0, Req_CodeGen - Model_CodeGen)
          + ...
```

**Cost Efficiency Formula (τ = q − λc):**

```
Score_i = (1 - Shortfall_i) - (λ × NormalizedCost_i)
```

**Frugality Slider (λ):** A user-configurable value. If `λ = 0.9`, the system aggressively penalizes cost. If `λ = 0.1`, the system favors capability regardless of API price.

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

### Lane 2: State, Cost & Gateway Resilience

| Task | Description |
|------|-------------|
| **2.1** | `session-pinner.ts` — Redis logic for context caching boundaries. |
| **2.2** | `gateway-dispatch.ts` — Token Bucket (Lua) & LQM Weighted Round-Robin. |
| **2.3** | `circuit-breaker.ts` — 5xx failovers and cooldown probes. |
| **2.4** | `price-broker.ts` — 24-hour background fetch caching LiteLLM pricing. |
| **2.5** | `pricing-monitor.ts` — 14-day agentic reminder loop. |

### Lane 3: Routing ML & Local HTTP Backends

| Task | Description |
|------|-------------|
| **3.1** | `hydra-matcher.ts` — ONNX runtime and FrugalGPT-weighted Shortfall matching. |
| **3.2** | `local-zero-tier.ts` — Active memory cascading pings (LM Studio `/v1/models` → Ollama `/api/ps`). |

### Lane 4: Orchestration & SDD Guardrails (stet)

| Task | Description |
|------|-------------|
| **4.1** | `router-pipeline.ts` — Wire Lanes 1–3 sequentially. |
| **4.2** | `.stet.yaml` Configuration — Enforce zero-crash fallbacks (if local APIs or AST fail, default to cloud, never crash the IDE). Ban `any` types. Enforce <10ms latency bounds on regex triage. |

### Phase 2 (Post-MVP): Native Backends

| Task | Description |
|------|-------------|
| **5.1** | Replace HTTP backends with Apple MLX native Node wrapper. |
| **5.2** | Integrate CUDA EP for `onnxruntime-node` (Windows/Linux). |

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

Copy the Markdown contents of this PRD and save it as `.specify/templates/spec.md`.

### 4. Run Spec-Driven Generation

Trigger your AI coding agent (e.g., inside pi.dev or Copilot) with `/speckit.plan` to generate the file tree, followed by `/speckit.tasks` to convert Section 6 into trackable implementation tickets.
