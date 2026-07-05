# pi-smart-router

**Auto-model router middleware for the [pi](https://pi.dev) coding agent.**

pi-smart-router intercepts every LLM inference request and dynamically routes it to the optimal execution engine — balancing cost, capability, latency, and time-to-first-token (TTFT) — without requiring you to manually pick a model for each turn.

| pi-smart-router is | pi-smart-router is not |
|--------------------|------------------------|
| A pi extension that auto-selects the best model per request | A replacement for pi or your LLM provider |
| A three-tier router: local, economical cloud, frontier cloud | A post-generation output judger (FrugalGPT-style) |
| Cache-aware with session pinning to preserve prompt-cache economics | A turn-by-turn model switcher that shatters provider caching |
| Registry-driven in pi (no YAML copy for normal use) | An RL-trained router requiring agent trace datasets |

## How it works

```text
request → hardware probe → loop escalation → session pin
        → deterministic triage → turn envelope → local zero-tier
        → HyDRA embedding matcher → safe cloud default (fallback)
```

The pipeline runs **7 stages sequentially with early exit** — the moment any stage reaches a routing decision, subsequent stages are skipped. Every decision includes the stage name, reason code, candidates considered, estimated cost, and routing latency for full observability.

| Stage | Budget | What it does |
|-------|--------|--------------|
| Hardware Probe | — | Checks macOS/ARM64/RAM/battery to gate local inference |
| Loop Escalation | — | Detects repeated identical tool failures; escalates session to frontier |
| Session Pin | <1ms | Returns pinned model if session has one; breaks pin on compaction or user override |
| Deterministic Triage | <5ms | Aho-Corasick keyword scan + cyclomatic complexity analysis |
| Turn Envelope | <2ms | Classifies turn type: tool_result, planning, subagent, main_loop |
| Local Zero-Tier | <15ms | Pings LM Studio + Ollama in parallel; routes locally if a model is loaded |
| HyDRA Matcher | 80-120ms | ONNX embeddings, 3D requirement projection, shortfall gate, multi-objective scoring |

If no stage decides, `safeCloudDefault` selects the first healthy economical-cloud model.

## Research lineage

pi-smart-router builds on ideas from several production and research routing systems:

- **Adopted:** [GitHub Copilot HyDRA](https://arxiv.org/abs/2409.08379) (shortfall matching decoupled from model identities), Zero-Tier local edge-cache pattern, [Weave Router](https://github.com/workweave/router) session pinning and multi-objective selection
- **Rejected:** FrugalGPT sequential cascading (tail latency), RouteLLM matrix factorization (confounder vulnerability), turn-by-turn dynamic routing (cache destruction)

See [docs/PRD.md](docs/PRD.md) for full architectural justification.

## Prerequisites

| Dependency | Required | Notes |
|------------|----------|-------|
| [Node.js](https://nodejs.org/) >= 20 | Yes | ES module package |
| [pi](https://pi.dev) coding agent | Yes | Extension host |
| macOS Apple Silicon | MVP | Linux/Windows planned for future phases |
| [LM Studio](https://lmstudio.ai/) or [Ollama](https://ollama.com) | Optional | Required for zero-tier local routing |
| Authenticated cloud providers in pi | Recommended | Anthropic, OpenAI, Google, etc. |

## Install

Clone this repository and install dependencies:

```bash
git clone https://github.com/beettlle/pi-smart-router.git
cd pi-smart-router
npm install
```

The project ships a **project-local pi extension** at `.pi/extensions/smart-router/`. pi auto-discovers it when you run `pi` from the repo root (after the project is trusted — see below).

> **Note:** A standalone `npm install pi-smart-router` publish path is not the primary install flow yet. Use the repo clone for the bundled extension.

## Dogfooding (pi extension)

Use the project-local extension at `.pi/extensions/smart-router/` to develop and test routing inside pi. This is the primary operator path for this repo.

**Quick path** (from repo root):

1. `npm install`
2. Start pi from this directory; accept the trust prompt (or run `/trust` and restart pi)
3. Authenticate providers (`/login`) and enable models in your scoped list if you use one (`/scoped-models`)
4. `/model smart-router/auto` — every turn runs through the routing pipeline
5. `/smart-router status` or `/smart-router history` — inspect routing decisions

Set `SMART_ROUTER_LOG_ROUTING=1` before starting pi to print each routing decision to stderr (see [Environment variables](#environment-variables)).

## Use with pi

Detailed steps for the dogfooding path above.

### 1. Authenticate your providers

Configure API keys for the providers you use in pi as usual (`/login`, pi settings, or environment variables). The router builds its fleet from **pi's model registry** — models you have not authenticated are not candidates.

### 2. Trust the project

Project-local extensions under `.pi/extensions/` load only after the project is trusted. Without trust, the smart-router provider is never registered — `smart-router` will not appear in `/scoped-models` or `/model`, and `/smart-router` commands will not exist.

**On first run**, pi prompts you to trust the project when it detects `.pi/extensions/`. Accept the prompt.

**Later or missed prompt:** run `/trust` inside pi to save a trust decision for this directory (or its parent) to `~/.pi/agent/trust.json`. Trust on a **parent folder** (for example `~/Documents/github`) applies to this repo as well. After `/trust`, **restart pi** — the current session is not reloaded automatically.

**Verify the extension loaded** (from the repo root, before or after starting pi):

```bash
cd pi-smart-router
pi --list-models | grep smart-router
```

You should see `smart-router  auto`. If the line is missing:

1. Confirm `pi` was started with cwd at this repo root (not a parent directory).
2. Confirm the project is trusted (`/trust`, or check `~/.pi/agent/trust.json`).
3. Restart pi or run `/reload` after trusting.

Non-interactive one-shot checks can pass `--approve` to trust project-local resources for that run only.

### 3. Select the auto model

Start pi from the repo root, then switch to the smart-router provider:

```text
/model smart-router/auto
```

If you use **scoped models** (`/scoped-models` or `enabledModels` in settings), enable `smart-router/auto` there first — when a scoped list is active, `/model` only resolves models in that list.

This registers `smart-router` as a custom provider with a single `auto` model. Every inference request runs through the routing pipeline and delegates to the selected underlying provider's streaming API.

### 4. Operator commands (optional)

| Command | Purpose |
|---------|---------|
| `/smart-router` | Same as `status` (default when no subcommand is given) |
| `/smart-router status` | Show fleet mode, fleet size, pricing freshness/staleness, and the last routing decision (stage, tier, selected model, latency) |
| `/smart-router history` | Show recent routing telemetry from SQLite (default limit; optional numeric limit, e.g. `/smart-router history 20`) |
| `/smart-router mode scoped` | Route only among pi's **enabled model patterns** (default) |
| `/smart-router mode all` | Route among **all authenticated models** in the registry |
| `/smart-router pricing refresh` | Manually fetch LiteLLM pricing from `LITELLM_PRICING_URL`, persist to SQLite, and rebuild the fleet with updated rates |

Fleet mode persists in the session. Use `scoped` to respect your `/model` enable-list; use `all` when you want the router to consider every provider you have logged into.

After typing `/smart-router ` (with a trailing space), press **TAB** to see subcommands. Continue TAB-completing after `mode` or `pricing` for sub-options (`scoped`/`all`, `refresh`).

### 5. Verify

```bash
npm run typecheck && npm test
```

## Fleet behavior

When you use `smart-router/auto`, the extension does **not** read `config/models.yaml`. Instead:

1. **Discover** — `modelRegistry.getAvailable()` returns authenticated models from pi.
2. **Scope** — In `scoped` mode, filter to patterns from pi settings (`getEnabledModels()`). In `all` mode, use the full registry.
3. **Map** — `src/config/pi-model-mapper.ts` maps each pi model to a `ModelProfile` (tier, capabilities, pricing) using provider and model-id patterns.
4. **Route** — `createRouterFromFleet()` runs the 7-stage pipeline on each request.
5. **Delegate** — The extension resolves the chosen model in the registry and forwards the stream via pi-ai's built-in provider APIs.

Unknown models receive conservative economical-cloud defaults. Local providers (`lmstudio`, `ollama`) map to `zero-tier`.

To refresh after auth or settings changes, restart pi or `/reload` extensions.

## Optional: YAML fleet (library API)

For programmatic integration **without** the pi extension, load a static fleet catalog from YAML and route via `GatewayDispatch.dispatch()`:

```bash
cp config/models.yaml.example ./config/models.yaml
# Edit config/models.yaml — at least one model per tier
```

```typescript
import { createRouter } from 'pi-smart-router';

const router = createRouter({ modelsPath: './config/models.yaml' });
router.register(piExtensionHooks); // lifecycle only: compaction + model override

const decision = await router.dispatch.dispatch(routingRequest);
// Embedder forwards inference to decision.selected_model_id
```

### Embedder integration paths

| Path | When to use | Routing | Lifecycle hooks |
|------|-------------|---------|-----------------|
| **Pi extension** (recommended) | Running inside pi | `.pi/extensions/smart-router/` registers `smart-router/auto` and delegates streams | Extension calls `router.register()`; compaction/model overrides wired automatically |
| **Library API** | Custom host, tests, or non-pi embedders | Your code calls `router.dispatch.dispatch()` (or wraps the pipeline) | Call `router.register(hooks)` to wire compaction and `model_select` events |

The library `createPiRouterMiddleware()` / `RouterHandle.register()` registers **lifecycle hooks only** — not routing, context capture, or `before_provider_request`. Do not expect `middleware` to intercept LLM streams; that is the extension's `streamSimple` path or your embedder's dispatch loop.

`createRouter()` returns a `RouterHandle`:

| Property | Type | Purpose |
|----------|------|---------|
| `middleware` | `PiRouterMiddleware` | Lifecycle hook registrar (`register`, `lifecycleHookState`) |
| `dispatch` | `GatewayDispatch` | Gateway with circuit breaker, failover, rate limiting |
| `fleet` | `readonly ModelProfile[]` | Loaded fleet catalog |
| `register` | `(hooks) => void` | Alias for `middleware.register` — attach pi lifecycle hooks |

You can also pass a pre-built fleet:

```typescript
import { createRouterFromFleet } from 'pi-smart-router';

const router = createRouterFromFleet(myFleetProfiles);
```

Example fleet entry:

```yaml
models:
  - id: local-gemma-4-7b
    tier: zero-tier
    provider: lmstudio
    endpoint: http://localhost:1234/v1
    capabilities:
      reasoning: 0.3
      code_gen: 0.6
      tool_use: 0.1
    pricing:
      registry_key: local/free
      fallback_cost_per_1m: 0.0

  - id: claude-3.5-haiku
    tier: economical-cloud
    provider: anthropic
    # ...

  - id: claude-3.5-sonnet
    tier: frontier-cloud
    provider: anthropic
    # ...
```

Tiers: `zero-tier`, `economical-cloud`, `frontier-cloud`. See [config/models.yaml.example](config/models.yaml.example).

## Configuration

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROUTER_STATE_DB_PATH` | `./.pi-smart-router/state.db` | Override SQLite state store location (telemetry, pricing catalog, session data) |
| `SMART_ROUTER_LOG_ROUTING` | (unset) | Set to `1` to log each routing decision to stderr as JSON (debugging dogfood sessions) |
| `SMART_ROUTER_DATASET` | (unset) | Set to `1` to opt in to privacy-safe routing dataset capture (metadata and feature fields only; 30-day / 10k-row retention). Prompt text, messages, and tool arguments are never stored. See [#8](https://github.com/beettlle/pi-smart-router/issues/8). |
| `MODELS_YAML_PATH` | `./config/models.yaml` | Fleet catalog path (library API only) |
| `ROUTER_SAFE_DEFAULT_TIER` | `economical-cloud` | Fallback tier on any routing failure |
| `LITELLM_PRICING_URL` | — | LiteLLM pricing JSON source |

### Operator tuning (frugality slider)

The multi-objective scoring weights control the cost-vs-quality tradeoff:

| Key | Default | Effect |
|-----|---------|--------|
| `frugality.lambda_cost` | 0.5 | Higher favors cheaper models at quality parity |
| `frugality.lambda_latency` | 0.1 | Higher penalizes slow models |
| `frugality.lambda_verbosity` | 0.15 | Higher penalizes verbose models |

Additional operator defaults:

| Key | Default | Purpose |
|-----|---------|---------|
| `loop_escalation.threshold` | 3 | Consecutive identical failures before escalating to frontier |
| `local.min_memory_gb_full` | 16 | Minimum RAM for full local inference |
| `local.battery_threshold_pct` | 20 | Minimum battery to allow local inference |
| `pricing.staleness_days` | 14 | Max age before re-fetching pricing data |

### HyDRA model cache

The embedding matcher uses `@huggingface/transformers` with the `Xenova/all-MiniLM-L6-v2` ONNX model (384-dim embeddings). Artifacts are downloaded at runtime and cached under `.pi-smart-router/models/` (configurable via `hydra.artifact_cache_path`). This directory is gitignored.

## Architecture

### Three execution tiers

| Tier | Catalog Name | Purpose | Example |
|------|-------------|---------|---------|
| Local | `zero-tier` | Free on-device inference for trivial tasks | Gemma via LM Studio |
| Cheap Cloud | `economical-cloud` | Budget API models for routine work | Claude Haiku |
| Frontier Cloud | `frontier-cloud` | Top-tier models for complex reasoning | Claude Sonnet |

### Pi extension (`.pi/extensions/smart-router/`)

The project-local extension (primary pi integration path):

- Registers provider **`smart-router`** with model **`auto`**
- Implements **`streamSimple`** — runs the pipeline, resolves the target in `ModelRegistry`, delegates to the built-in streaming API for that provider
- Wires lifecycle hooks via `router.register()` for session state:

| Event | Purpose |
|-------|---------|
| `session_compact` / `session_before_compact` | Breaks session pin on compaction (via `LifecycleHookState`) |
| `model_select` | Records user-forced model overrides when `source === "set"` |
| `session_start` | Restores fleet mode from session entries |

Conversation context for routing is read from the stream delegation path (`buildRoutingRequest`), not from a library `context` hook. Library embedders supply `messages` / `prompt_text` when calling `dispatch.dispatch()`.

### Session pinning

Sessions pin to the first routed model to preserve provider-side prompt prefix caching. Pins break only on:

- Session compaction
- User model override (`/model` in pi)
- Loop escalation (repeated identical tool failures)
- Cache-warmup economics threshold

Sub-routing within a pin is allowed: small `tool_result` turns may use an economical model on the same provider without breaking the pin.

### Gateway resilience

The `GatewayDispatch` layer wraps the pipeline with:

- **Circuit breaker** — Per-model, tracks consecutive 5xx/network errors (CLOSED → OPEN → HALF_OPEN). 4xx and safety errors do not trip the breaker.
- **Failover chains** — On open circuit, routes to same-tier alternative via inverse-cost weighted selection.
- **Rate limiting** — Per-operator-key token bucket with `429 + Retry-After` responses.

### Explain endpoint

The explain handler runs the identical pipeline but returns the `RoutingDecision` without dispatching upstream inference — guaranteeing bit-for-bit decision equivalence with the live path. Useful for debugging, operator trust, and shadow runs.

## API

### Public exports

```typescript
import {
  createRouter,
  createRouterFromFleet,
  createPiRouterMiddleware,
  LifecycleHookState,
  type RoutingDecision,
  type ModelProfile,
  type PiRouterMiddleware,
  type PiExtensionHooks,
  type RouterHandle,
} from 'pi-smart-router';
```

`createPiRouterMiddleware()` is exported for advanced embedders that need a standalone lifecycle hook registrar. Most callers should use `createRouter()` / `createRouterFromFleet()` and call `register()` on the returned handle.

### `RoutingDecision`

Every routing decision includes:

| Field | Type | Description |
|-------|------|-------------|
| `selected_model_id` | `string` | Fleet model ID chosen |
| `tier` | `Tier` | `zero-tier`, `economical-cloud`, or `frontier-cloud` |
| `stage` | `string` | Pipeline stage that decided (triage, session_pin, local_zero, etc.) |
| `reason_code` | `string` | Machine-readable reason |
| `candidates` | `string[]` | Models considered before selection |
| `estimated_cost_usd` | `number` | Per-request cost estimate |
| `routing_latency_ms` | `number` | Time spent in the routing pipeline |

## Development

```bash
git clone https://github.com/beettlle/pi-smart-router.git
cd pi-smart-router
npm install
npm run build
npm run typecheck && npm test
```

Contributors must run `npm run build` before publishing or consuming the library API from `dist/`. The pi extension at `.pi/extensions/smart-router/` uses TypeScript source directly and does not require a build for local dogfooding.

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile library to `dist/` (`tsc --project tsconfig.build.json`) |
| `npm run typecheck` | TypeScript strict mode check (`tsc --noEmit`) |
| `npm test` | Run test suite (`vitest run`) |
| `npm run lint` | ESLint + fleet catalog validation |

### Test suite

647 tests across 34 test files covering:

- Unit tests for every pipeline stage, domain module, and infrastructure component
- Contract tests validating routing request/decision schemas
- Integration tests for full pipeline routing, session pinning, latency budgets, and cost baselines
- Pi extension tests (`tests/integration/pi-extension.test.ts`) for registry → fleet → stream delegation
- Resilience tests for circuit breaker, failover, and rate limiting

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/PRD.md](docs/PRD.md) | Product requirements, research lineage, pipeline specification |
| [docs/constitution.md](docs/constitution.md) | Project principles and non-negotiable rules |
| [specs/001-build-smart-router/spec.md](specs/001-build-smart-router/spec.md) | Detailed feature specification |
| [specs/001-build-smart-router/data-model.md](specs/001-build-smart-router/data-model.md) | Entity definitions, schemas, configuration reference |
| [specs/001-build-smart-router/quickstart.md](specs/001-build-smart-router/quickstart.md) | Setup and verification guide |
| [config/models.yaml.example](config/models.yaml.example) | Fleet catalog template (library API) |

## Built with

- [pi](https://pi.dev) — Coding agent harness (extension host)
- [@earendil-works/pi-ai](https://pi.dev) — Provider streaming APIs
- [pi-spine](https://github.com/beettlle/pi-spine) — Batch orchestration (used to build this project)
- [stet](https://github.com/beettlle/stet) — Local code review (guardrails during development)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Shared state store
- [zod](https://zod.dev) — Runtime schema validation
- [@huggingface/transformers](https://huggingface.co/docs/transformers.js) — ONNX embedding inference for HyDRA matcher

## License

MIT
