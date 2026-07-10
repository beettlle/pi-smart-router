# pi-smart-router

**Auto-model router middleware for the [pi](https://pi.dev) coding agent.**

> **v0.1.0** is initial development (SemVer `0.y.z`). The public API and routing behavior may change until `1.0.0`.

pi-smart-router intercepts every LLM inference request and dynamically routes it to the optimal execution engine — balancing cost, capability, latency, and time-to-first-token (TTFT) — without requiring you to manually pick a model for each turn.

| pi-smart-router is | pi-smart-router is not |
|--------------------|------------------------|
| A pi extension that auto-selects the best model per request | A replacement for pi or your LLM provider |
| A three-tier router: local, economical cloud, frontier cloud | A post-generation output judger (FrugalGPT-style) |
| Cache-aware with session pinning to preserve prompt-cache economics | A turn-by-turn model switcher that shatters provider caching |
| Registry-driven in pi (no YAML copy for normal use) | An RL-trained router requiring agent trace datasets |

## How it works

```text
request → hardware probe → loop escalation → turn envelope → context-fit gate
        → low-intensity tier gate → session pin → deterministic triage
        → local zero-tier → HyDRA embedding matcher → safe cloud default
        → context overflow fallback
```

The pipeline runs **12 stages sequentially with early exit** — the moment any stage reaches a routing decision, subsequent stages are skipped. Every decision includes the stage name, reason code, candidates considered, estimated cost, and routing latency for full observability.

| Stage | Budget | What it does |
|-------|--------|--------------|
| Hardware Probe | — | Checks platform/RAM/battery to gate local inference |
| Loop Escalation | — | Detects repeated identical tool failures; escalates session to frontier |
| Turn Envelope | <2ms | Classifies turn type: tool_result, planning, subagent, main_loop |
| Context-Fit Gate | — | Filters fleet to models whose context window fits estimated input tokens |
| Low-Intensity Gate | — | Structural tier hint, cluster match, and P(success) expected-cost scoring |
| Session Pin | <1ms | Returns pinned model if session has one; breaks pin on compaction or overflow |
| Deterministic Triage | <5ms | Aho-Corasick keyword scan + cyclomatic complexity analysis |
| Local Zero-Tier | <15ms | Pings LM Studio + Ollama in parallel; routes locally when eligible |
| HyDRA Matcher | 80-120ms | ONNX embeddings, 3D requirement projection, shortfall gate, multi-objective scoring |
| Safe Cloud Default | — | First healthy economical-cloud model (context-fit aware) |
| Context Overflow Fallback | — | Escalates to largest-fit model when economical tiers cannot fit |

## Research lineage

pi-smart-router builds on ideas from several production and research routing systems:

- **Adopted:** [GitHub Copilot HyDRA](https://arxiv.org/abs/2409.08379) (shortfall matching decoupled from model identities), Zero-Tier local edge-cache pattern, [Weave Router](https://github.com/workweave/router) session pinning and multi-objective selection
- **Rejected:** FrugalGPT sequential cascading (tail latency), RouteLLM matrix factorization (confounder vulnerability), turn-by-turn dynamic routing (cache destruction)

See [docs/PRD.md](docs/PRD.md) for full architectural justification, [docs/deep-research.md](docs/deep-research.md) for the research survey, [docs/routing-roadmap.md](docs/routing-roadmap.md) for the prioritized quality backlog, [docs/gemini-research.md](docs/gemini-research.md) for the second-source agent-router report, and [docs/research/README.md](docs/research/README.md) for research provenance.

## Prerequisites

| Dependency | Required | Notes |
|------------|----------|-------|
| [Node.js](https://nodejs.org/) >= 22 | Yes | ES module package; matches CI and `package.json` engines |
| [pi](https://pi.dev) coding agent | Yes | Extension host |
| macOS Apple Silicon | MVP | Primary supported platform |
| Linux (x64/arm64) | Experimental | Probe logic supported; not validated on real hardware |
| Windows (x64/arm64) | Experimental | Probe logic supported; not validated on real hardware |
| [LM Studio](https://lmstudio.ai/) or [Ollama](https://ollama.com) | Optional | Required for zero-tier local routing |
| Authenticated cloud providers in pi | Recommended | Anthropic, OpenAI, Google, etc. |

## Install

> **Security:** Pi packages run with full system access. Extensions execute arbitrary code. Review source before installing third-party packages ([pi packages docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)).

### Via pi (recommended)

Install from [npm](https://www.npmjs.com/package/pi-smart-router) / [pi.dev/packages](https://pi.dev/packages):

```bash
pi install npm:pi-smart-router
pi --list-models | grep smart-router
```

Project-local install (writes to `.pi/settings.json`):

```bash
pi install -l npm:pi-smart-router
```

Then in pi:

```text
/model smart-router/auto
/smart-router status
```

**First run:** `pi install` runs `npm install` for package dependencies (`better-sqlite3` compiles natively). The first routed request downloads HyDRA ONNX weights to `.pi-smart-router/models/` under your state directory.

### Via npm (library API)

```bash
npm install pi-smart-router
```

Use `createRouter()` / `createRouterFromFleet()` for programmatic integration without the pi extension. See [Optional: YAML fleet (library API)](#optional-yaml-fleet-library-api).

### From source (contributors)

```bash
git clone https://github.com/beettlle/pi-smart-router.git
cd pi-smart-router
npm install
```

The repo ships a **project-local pi extension** at `.pi/extensions/smart-router/`. pi auto-discovers it when you run `pi` from the repo root (after the project is trusted — see [Develop from clone](#develop-from-clone)).

## Quick start

After installing via `pi install npm:pi-smart-router` (or from clone — see below):

1. Authenticate providers (`/login`) and enable models in your scoped list if you use one (`/scoped-models`)
2. `/model smart-router/auto` — every turn runs through the routing pipeline
3. `/smart-router status` or `/smart-router history` — inspect routing decisions

Set `SMART_ROUTER_LOG_ROUTING=1` before starting pi to print each routing decision to stderr (see [Environment variables](#environment-variables)).

## Use with pi

Detailed steps for the operator path above.

### Installed via npm

Global install (`pi install npm:pi-smart-router`) registers the extension from `~/.pi/agent/settings.json`. No project `/trust` prompt is required for npm-installed extensions — start `pi` from any directory.

After auth or model list changes, restart pi or run `/reload`.

### Develop from clone

Project-local extensions under `.pi/extensions/` load only after the project is trusted. Without trust, the smart-router provider is never registered — `smart-router` will not appear in `/scoped-models` or `/model`, and `/smart-router` commands will not exist.

**On first run**, pi prompts you to trust the project when it detects `.pi/extensions/`. Accept the prompt.

**Later or missed prompt:** run `/trust` inside pi to save a trust decision for this directory (or its parent) to `~/.pi/agent/trust.json`. Trust on a **parent folder** (for example `~/Documents/github`) applies to this repo as well. After `/trust`, **restart pi** — the current session is not reloaded automatically.

**Verify the extension loaded** (from the repo root):

```bash
cd pi-smart-router
pi --list-models | grep smart-router
```

You should see `smart-router  auto`. If the line is missing:

1. Confirm `pi` was started with cwd at this repo root (not a parent directory).
2. Confirm the project is trusted (`/trust`, or check `~/.pi/agent/trust.json`).
3. Restart pi or run `/reload` after trusting.

Non-interactive one-shot checks can pass `--approve` to trust project-local resources for that run only.

### Select the auto model

Switch to the smart-router provider (from any directory after npm install, or from repo root when developing from clone):

```text
/model smart-router/auto
```

If you use **scoped models** (`/scoped-models` or `enabledModels` in settings), enable `smart-router/auto` there first — when a scoped list is active, `/model` only resolves models in that list.

This registers `smart-router` as a custom provider with a single `auto` model. Every inference request runs through the routing pipeline and delegates to the selected underlying provider's streaming API.

#### `cursor/auto` vs `smart-router/auto`

pi exposes two different **auto** models. They are easy to confuse but play different roles:

| Model | Provider | Role |
|-------|----------|------|
| `smart-router/auto` | `smart-router` (this extension) | Runs the routing pipeline on every turn and **delegates** to whichever underlying model HyDRA selects |
| `cursor/auto` | `cursor` (pi registry) | Cursor's opaque auto model — **direct** inference target when selected; Cursor picks the backend model |

**Recommended dogfood setup:** use `/model smart-router/auto` so routing, pinning, and telemetry stay active. Enable `cursor/auto` (and other Cursor models such as `composer-latest`) in your scoped fleet so the router can select them when appropriate — for example on planning turns or when the [Gemini tool-history guard](#gemini-thought_signature-400-errors) excludes unrepairable Google replay state.

**When to pin `/model cursor/auto` directly (bypass the router):**

- You want Cursor's opaque auto selection on every turn with no routing overhead
- You are debugging Cursor SDK auth or delegation outside the router
- You need a stable, non-routed session for comparison with routed behavior

**When to use `smart-router/auto`:**

- You want cost/capability-aware model selection across your full authenticated fleet
- You rely on session pinning, failover, or `/smart-router status` / `history` telemetry
- Tool-heavy sessions with Gemini economical models work via in-repo replay repair; add `cursor/auto` for unrepairable Google replay edge cases (see [pi-smart-router#85](https://github.com/beettlle/pi-smart-router/issues/85))

Cursor models (`cursor/*`, `composer-*`, and the opaque fleet id `default`) map to **frontier-cloud** tier in `pi-model-mapper.ts` so HyDRA can score them against Gemini and Claude instead of treating them as unknown economical models ([pi-smart-router#40](https://github.com/beettlle/pi-smart-router/issues/40), [pi-smart-router#70](https://github.com/beettlle/pi-smart-router/issues/70)). Related: [pi-smart-router#23](https://github.com/beettlle/pi-smart-router/issues/23) (turn envelope / pin order), [pi-smart-router#37](https://github.com/beettlle/pi-smart-router/issues/37) (Gemini `thought_signature` errors).

#### Cursor subscription quota vs API cost

Cursor models bill against your **Cursor Pro subscription quota**, not per-token API rates. The mapper sets `fallback_cost_per_1m: 0` (no API billing) and a separate **`quota_cost_per_1m`** virtual rate used only for frugality scoring and telemetry ([SP-096](https://github.com/beettlle/pi-smart-router/issues/70)). Economical API models (e.g. `gemini-flash-lite`) can outscore `composer-latest` on routine `main_loop` turns when capabilities are sufficient.

**Quota-sensitive fleet hygiene:** if you are near Cursor usage limits, **exclude `composer-latest`** (and other heavy Cursor frontier models) from your pi scoped fleet enable-list. Leave economical API models enabled so turn envelope and HyDRA prefer paid API tiers over subscription quota. The opaque id `default` is mapped to frontier tier — do not rely on it as an economical fallback.

### Operator commands

| Command | Purpose |
|---------|---------|
| `/smart-router` | Same as `status` (default when no subcommand is given) |
| `/smart-router status` | Show fleet mode, fleet size, pricing freshness/staleness, and the last routing decision (stage, tier, selected model, latency) |
| `/smart-router history` | Show recent routing telemetry from SQLite (default limit; optional numeric limit, e.g. `/smart-router history 20`). Displays the concrete delegated model id (never bare virtual `auto`) |
| `/smart-router mode scoped` | Route only among pi's **enabled model patterns** (default) |
| `/smart-router mode all` | Route among **all authenticated models** in the registry |
| `/smart-router pricing refresh` | Manually fetch LiteLLM pricing from `LITELLM_PRICING_URL`, persist to SQLite, and rebuild the fleet with updated rates |
| `/smart-router export dataset [--limit N]` | Export opt-in routing dataset as JSONL (requires `SMART_ROUTER_DATASET=1`) |
| `/smart-router export telemetry-contrib [--limit N]` | Export privacy-safe community telemetry JSON for calibration contributions |
| `/smart-router feedback good\|bad` | Label the last auto-routed request outcome (requires `SMART_ROUTER_DATASET=1`) |
| `/smart-router unpin` | Clear the current session pin (in-memory and SQLite) so the next request runs the full routing pipeline |

Fleet mode persists in the session. Use `scoped` to respect your `/model` enable-list; use `all` when you want the router to consider every provider you have logged into.

After typing `/smart-router ` (with a trailing space), press **TAB** to see subcommands. Continue TAB-completing after `mode` or `pricing` for sub-options (`scoped`/`all`, `refresh`).

### 5. Verify

```bash
npm run verify:ci
```

## Fleet behavior

When you use `smart-router/auto`, the extension does **not** read `config/models.yaml`. Instead:

1. **Discover** — `modelRegistry.getAvailable()` returns authenticated models from pi.
2. **Scope** — In `scoped` mode, filter to patterns from pi settings (`getEnabledModels()`). In `all` mode, use the full registry.
3. **Map** — `src/config/pi-model-mapper.ts` maps each pi model to a `ModelProfile` (tier, capabilities, pricing) using provider and model-id patterns.
4. **Route** — `createRouterFromFleet()` runs the 12-stage pipeline on each request.
5. **Delegate** — The extension resolves the chosen model in the registry and forwards the stream via pi-ai's built-in provider APIs.

Unknown models receive conservative economical-cloud defaults. Local providers (`lmstudio`, `ollama`) map to `zero-tier`. Cursor provider models (`cursor/*`, `composer-*`, opaque id `default`) map to `frontier-cloud` with explicit capability defaults (SP-086, SP-098).

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
| **Pi extension** (recommended) | Running inside pi | `pi install npm:pi-smart-router` (or project-local `.pi/extensions/smart-router/` when developing from clone) registers `smart-router/auto` and delegates streams | Extension calls `router.register()`; compaction/model overrides wired automatically |
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

### Routing cluster catalog (library API)

Reference prompts grouped by tier bias for semantic cluster matching (SP-099). Operators tune clusters in YAML without code changes. Precomputed centroids live in `config/routing-centroids.json` (SP-114); when that file is absent, centroids are computed at load time as the mean embedding of each cluster's reference prompts.

```bash
cp config/routing-clusters.yaml.example ./config/routing-clusters.yaml
cp config/routing-centroids.json.example ./config/routing-centroids.json
# Edit reference_prompts, min_similarity, and min_margin per cluster
# Regenerate centroids after catalog changes:
npm run routing:bootstrap-centroids
```

The bootstrap script embeds each reference prompt via the HyDRA MiniLM ONNX pipeline (384-dim), mean-pools to centroid vectors, and writes `config/routing-centroids.json` with `{ cluster_id, tier_bias, centroid, reference_count }` per cluster. ONNX artifacts cache under `.pi-smart-router/models/` on first run.

```typescript
import { loadRoutingClusters } from 'pi-smart-router';

const catalog = await loadRoutingClusters({
  filePath: './config/routing-clusters.yaml',
  embedder: myTextEmbedder, // shared ONNX embedder (SP-100)
});
// Reason codes: cluster_${id} — e.g. cluster_low_stakes_general

// createClusterMatcher (cluster-matcher module) prefers routing-centroids.json when present.
```

Cluster IDs are stable reason-code prefixes (`cluster_low_stakes_general`, `cluster_architecture`, etc.). See [config/routing-clusters.yaml.example](config/routing-clusters.yaml.example).

## Configuration

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROUTER_STATE_DB_PATH` | `./.pi-smart-router/state.db` | Override SQLite state store location (telemetry, pricing catalog, session data) |
| `SMART_ROUTER_LOG_ROUTING` | (unset) | Set to `1` to log each routing decision to stderr as JSON (debugging dogfood sessions). Canonical payload builder (`buildRoutingDecisionLogPayload`) includes top-level `stage`, `reason_code`, `low_intensity_score`, `tier_hint`, `local_eligible_reason`, and `cluster_id` (plus nested `cluster_summary` / `features`). The pi extension’s live stderr logger is still a slim subset — see [LOG_ROUTING field checklist](#log_routing-field-checklist) |
| `SMART_ROUTER_DATASET` | (unset) | Set to `1` to opt in to privacy-safe routing dataset capture (metadata and feature fields only; 30-day / 10k-row retention). Prompt text, messages, and tool arguments are never stored. Required for outcome labels and P(success) training export. See [#8](https://github.com/beettlle/pi-smart-router/issues/8). |
| `SMART_ROUTER_DATASET_FINGERPRINT` | (unset) | Set to `1` (requires `SMART_ROUTER_DATASET=1`) to store an install-local HMAC-SHA256 fingerprint of each normalized prompt for duplicate detection within this install. The install pepper lives in `.pi-smart-router/.dataset-key` (gitignored) and is never exported. **Warning:** short or common prompts are vulnerable to offline rainbow-table guessing; use only when you accept that tradeoff. See [#10](https://github.com/beettlle/pi-smart-router/issues/10). |
| `MODELS_YAML_PATH` | `./config/models.yaml` | Fleet catalog path (library API only) |
| `SMART_ROUTER_PLANNING_TURN_BUFFER` | `2` | SAAR planning buffer: frontier planning turns allowed before hard-lock ([v0.2.0 Continuity](https://github.com/beettlle/pi-smart-router/issues/72)) |
| `SMART_ROUTER_PLANNING_DELEGATE_ENABLED` | `true` | Enable cache-preserving planning delegate ([#71](https://github.com/beettlle/pi-smart-router/issues/71)) |
| `SMART_ROUTER_PLANNING_DELEGATE_MAX_MESSAGES` | `12` | Compressed-context message cap for frontier sub-call |
| `SMART_ROUTER_PLANNING_DELEGATE_MAX_TOKENS` | `16384` | Compressed-context token cap for frontier sub-call |
| `SMART_ROUTER_PLANNING_DELEGATE_EXCLUDE_EXECUTION_HISTORY` | `true` | Exclude tool execution history from delegate payload |
| `SMART_ROUTER_PREFIX_CACHE_WEIGHT` | `0.20` | SAAR weight on warm prefix value in cache breakeven math (0–1; [#73](https://github.com/beettlle/pi-smart-router/issues/73)) |
| `SMART_ROUTER_IDLE_TIMEOUT_SECONDS` | `300` | SAAR idle seconds before pin reopens for full re-route |
| `SMART_ROUTER_SWITCH_THRESHOLD` | `0.5` | SAAR switch score gate (0–1) for tier upgrades during hard-lock |
| `ROUTER_SAFE_DEFAULT_TIER` | `economical-cloud` | Fallback tier on any routing failure |
| `LITELLM_PRICING_URL` | — | LiteLLM pricing JSON source |

### LOG_ROUTING field checklist

When `SMART_ROUTER_LOG_ROUTING=1`, prefer the canonical payload from `buildRoutingDecisionLogPayload` (library / tests). Checklist for [#99](https://github.com/beettlle/pi-smart-router/issues/99):

| Field | In payload builder? | Notes |
|-------|---------------------|-------|
| `stage` | Yes (top-level) | Pipeline stage that decided |
| `reason_code` | Yes (top-level) | Machine-readable reason |
| `low_intensity_score` | Yes (top-level + `cluster_summary`) | Null when low-intensity stage did not run |
| `tier_hint` | Yes (top-level + `cluster_summary`) | Null when no tier hint |
| `local_eligible_reason` | Yes (top-level + `features`) | Null when local_zero did not evaluate eligibility |
| `cluster_id` | Yes (top-level + `cluster_summary`) | Null when no cluster match |

**Gap:** the pi extension’s live stderr path (`logRoutingDecision` in `.pi/extensions/smart-router`) still emits a slim JSON object (`selected_model_id`, `stage`, `reason_code`, `features`, `delegate`) and does **not** yet call `buildRoutingDecisionLogPayload`. SQLite `/smart-router history` and the payload builder carry the full checklist; wire the extension logger in a follow-up if dogfood needs identical stderr shape.

**History model id:** `/smart-router history` resolves bare/`smart-router` virtual `auto` to the concrete planning-delegate primary (or qualifies Cursor opaque `auto` as `cursor/auto`) so operators see the delegated fleet model, not the virtual router id.

### SAAR session pin and cache breakeven (v0.2.0 Continuity)

v0.2.0 adds **Session-Aware Agentic Routing (SAAR)** pin knobs ([#72](https://github.com/beettlle/pi-smart-router/issues/72)) and a **cache breakeven gate** ([#73](https://github.com/beettlle/pi-smart-router/issues/73)) that blocks tier switches when `marginal_savings + future_cache_value <= cache_reprime_cost` — preventing cheap-turn savings from invalidating a warm prefix cache.

| Knob | Env var | Default | Effect |
|------|---------|---------|--------|
| Planning buffer | `SMART_ROUTER_PLANNING_TURN_BUFFER` | `2` | First N turns may route planning to frontier while pin metadata stays economical |
| Prefix cache weight | `SMART_ROUTER_PREFIX_CACHE_WEIGHT` | `0.20` | Discounted future cache credit in breakeven |
| Idle reopen | `SMART_ROUTER_IDLE_TIMEOUT_SECONDS` | `300` | Seconds of inactivity before SAAR resets and pin reopens |
| Hard-lock upgrade gate | `SMART_ROUTER_SWITCH_THRESHOLD` | `0.5` | Score threshold for tier upgrades after buffer exhaust |

**Dogfood verification (multi-turn planning session)**

1. Start pi with routing logs: `SMART_ROUTER_LOG_ROUTING=1 pi` (optional: tune SAAR env vars above).
2. Run `/model smart-router/auto` and begin a multi-turn planning session (planning turns mixed with tool results).
3. Inspect stderr JSON lines — confirm `saar_summary.buffer_active` / `saar_reason_code: saar_buffer_active` on early planning turns, then `hard_lock: true` / `saar_hard_lock` after the buffer exhausts.
4. On a warm pinned session, trigger a `tool_result` sub-route — when breakeven fails, expect `breakeven_summary.decision: "blocked"` and `breakeven_reason_code: breakeven_blocked` while the pin holds.
5. Use `pi router explain` (or `POST /v1/route/explain`) on the same session — `features.breakeven` and `features.saar` mirror telemetry fields for operator audit.

See [routing-roadmap.md](docs/routing-roadmap.md) §2 P0 for design context.

### Planning delegate (v0.4.0 Delegate)

When a **planning** turn would route primary inference to frontier while a warm **economical** session pin is active, smart-router prefers **cache-preserving delegation** ([#71](https://github.com/beettlle/pi-smart-router/issues/71)):

1. **Pipeline** (`turn_envelope`) emits `planning_delegate` — primary stays on the pinned economical model; `features.planning_delegate` names the frontier **delegate** model and compressed-context limits.
2. **Pi extension** (`.pi/extensions/smart-router`) runs an ephemeral frontier sub-call with compressed context (tool execution history excluded by default), injects the result as an observation user message, then delegates **primary** streaming to the pinned economical model.
3. **Fallback** — when delegate is disabled, spawn fails, or the delegate model is missing from the registry, the extension falls back to a **direct frontier** route with a documented `fallback_reason` in explain/telemetry.

**Stream piping (SP-170):** Primary delegated inference **live-forwards** provider events to pi (`start` / `text_delta` / … as they arrive). The planning-delegate sub-call stays **buffered** — only the final observation text is injected into primary context; frontier tokens from the ephemeral sub-call are discarded and never reach the user-facing stream. On infra failover, a synthetic `text_delta` notice is pushed after the retry stream's `start` (no mutation of a buffered event array).

| Knob | Env var | Default | Effect |
|------|---------|---------|--------|
| Delegate enabled | `SMART_ROUTER_PLANNING_DELEGATE_ENABLED` | `true` | When `false`, SAAR buffer allows direct frontier planning (`planning_direct_frontier` + `planning_delegate_disabled`) |
| Compressed message cap | `SMART_ROUTER_PLANNING_DELEGATE_MAX_MESSAGES` | `12` | Max messages sent to the frontier sub-call |
| Compressed token cap | `SMART_ROUTER_PLANNING_DELEGATE_MAX_TOKENS` | `16384` | Token budget for compressed delegate context |
| Exclude tool history | `SMART_ROUTER_PLANNING_DELEGATE_EXCLUDE_EXECUTION_HISTORY` | `true` | Strip tool-call / tool-result turns from delegate payload |

**Coordination boundary with pi core:** smart-router owns **routing** (when to delegate, which models, compressed limits, fallback reason codes). **Sub-agent spawn and observation injection** run in the pi extension via `streamSimple` — pi core must expose a delegate/stream API the extension can call; smart-router does not orchestrate pi's outer sub-agent scheduler. Operators enabling `/model smart-router/auto` get delegate behavior automatically when the extension is loaded; no separate pi sub-agent config is required beyond a frontier model in the registry.

**Dogfood verification (planning delegate)**

1. Start pi with routing logs: `SMART_ROUTER_LOG_ROUTING=1 pi` and `/model smart-router/auto`.
2. Begin a session on an economical pin (routine prompts), then trigger planning turns (e.g. architecture or multi-step design work).
3. Inspect stderr JSON — on delegate turns expect `reason_code: planning_delegate`, `planning_delegate_summary.path: "delegate"`, `primary_model_id` equal to the pin, and `delegate_model_id` pointing at frontier.
4. Confirm primary inference stays on the economical model (cache-friendly) while stderr shows `[smart-router] planning delegate sub-call completed` with the frontier model id.
5. Disable delegate (`SMART_ROUTER_PLANNING_DELEGATE_ENABLED=false`) and repeat — expect `planning_direct_frontier` with `fallback_reason: planning_delegate_disabled`.
6. Use `pi router explain` (or `POST /v1/route/explain`) on the same session — `features.planning_delegate` mirrors live routing (`path: delegate` vs `direct`, `fallback_reason` when applicable).

See [routing-roadmap.md](docs/routing-roadmap.md) §2 P0 and GitHub [#71](https://github.com/beettlle/pi-smart-router/issues/71) for acceptance criteria.

### Virtual cost v2 (v0.5.0 subscription economics)

**Virtual cost v2** extends SP-096 flat `quota_cost_per_1m` with deterministic subscription-window economics ([#78](https://github.com/beettlle/pi-smart-router/issues/78)). It inflates effective frontier cost late in a rolling quota window and credits warm prefix-cache value on active pins — without MDP or reinforcement-learning quota policy (SeqRoute HBR+CQL is deferred).

**Formula (per turn)**

`effective_cost_usd = base × λ + quota_arbitrage_premium + exhaustion_risk_premium + kv_cache_savings`

| Component | Meaning |
|-----------|---------|
| `base` | SP-096 subscription virtual cost (`quota_cost_per_1m`) or sticker `fallback_cost_per_1m` |
| **λ (quota decay)** | Multiplier rising from 1 at full window toward `lambda_max_multiplier` as budget depletes |
| **Quota arbitrage premium** | Opportunity-cost uplift for burning subscription quota late in the window |
| **Exhaustion risk premium** | Extra penalty when remaining window fraction falls below `exhaustion_risk_threshold` |
| **KV-cache savings** | Negative credit when pin is active and prefix is warm (`prefix_cache_discount` × `prefix_cache_weight`) |

**Window position**

Rolling-window position is supplied to the router pipeline as `quotaWindowPosition` (library API / telemetry integration). Use `remaining_window_fraction` in `[0, 1]` (1 = full budget). Optionally derive it from elapsed time and consumed quota via `deriveRemainingWindowFraction(elapsed_seconds, consumed_fraction)` in `virtual-cost-v2.ts` (defaults assume a Cursor-style **5h** window).

When `quotaWindowPosition` is omitted, λ stays at 1 and quota premiums are zero — behavior matches SP-096 flat virtual cost.

**Operator knobs** (`VirtualCostV2Config` — wire through `RouterPipeline` options today; defaults in `DEFAULT_VIRTUAL_COST_V2_CONFIG`):

| Knob | Default | Effect |
|------|---------|--------|
| `window_duration_seconds` | `18000` (5h) | Rolling window length for time-based remaining fraction |
| `lambda_decay_exponent` | `2` | Curvature of λ rise as window depletes |
| `lambda_max_multiplier` | `3` | λ cap at exhaustion |
| `quota_arbitrage_weight` | `0.5` | Weight on late-window arbitrage premium |
| `exhaustion_risk_weight` | `1` | Weight on exhaustion risk below threshold |
| `exhaustion_risk_threshold` | `0.2` | Remaining fraction below which exhaustion premium applies |
| `prefix_cache_discount` | `0.9` | Assumed prefix-cache discount on warm tokens |
| `prefix_cache_weight` | `0.2` | Retained future cache value (aligned with SAAR `SMART_ROUTER_PREFIX_CACHE_WEIGHT`) |

**Where v2 applies**

- **Expected-cost tier selection** — frontier/composer effective cost rises near window exhaustion; economical tiers can win when subscription quota is scarce.
- **Cache breakeven gate** — marginal switch savings and observability use v2 when `quotaWindowPosition` is set; KV credit on the pinned model reduces marginal savings and can block unnecessary pin breaks.

**Dogfood verification**

1. Configure a fleet with subscription `quota_cost_per_1m` on cursor/composer frontier models (see `config/models.yaml.example`).
2. Run routing with `quotaWindowPosition: { remaining_window_fraction: 0.05 }` via library `RouterPipeline` options — inspect `tier_selection` / expected-cost rationale for `v2 λ=`, `quota_premium=`, `exhaustion=`, `cache_credit=` strings.
3. On a warm pinned session with low `remaining_window_fraction`, trigger a `tool_result` sub-route — when cache credit plus reprime math fails breakeven, expect pin hold (`breakeven_blocked`) in routing logs and `features.breakeven` on explain.
4. Compare `remaining_window_fraction: 1` vs `0.02` on the same request — late-window runs should show higher frontier `effective_cost_usd` in `features.tier_selection.tier_costs[].virtual_cost_v2`.

See [routing-roadmap.md](docs/routing-roadmap.md) §2 P2 and GitHub [#78](https://github.com/beettlle/pi-smart-router/issues/78).

### P(success) training export (baseline classifier)

When `SMART_ROUTER_DATASET=1`, the router records privacy-safe dataset rows and behavioral outcome labels (model override, compaction pin break, `/smart-router feedback good|bad`). Export labeled training data from pi:

```bash
/smart-router export dataset [--limit N]
```

Each JSONL row joins dataset features with `success_label` and `outcome_signals`. Success means no negative outcome signals were recorded for that `request_id` (for example `model_override` or `feedback_bad` mark failure). Prompt plaintext is never included.

**Dogfood artifact (SP-175):** the repo ships a non-example `config/p-success-weights.json` trained on the synthetic fixture at `scripts/fixtures/p-success-synthetic-train.jsonl` (**provenance: synthetic/fixture**, not community contrib — 40 labeled feature-vector rows, no prompt text). With `trained_sample_count ≥ 30`, the low-intensity gate uses trained logistic scores instead of neutral `0.5`. Missing or invalid artifacts still fall back safely to neutral defaults.

**Operator train / reload (no prompt text):**

```bash
# 1) Opt in + dogfood, then export privacy-safe labeled JSONL (features + labels only)
SMART_ROUTER_DATASET=1
# …run sessions with /model smart-router/auto and /smart-router feedback…
/smart-router export dataset --limit 200

# 2) Train standalone weights (≥30 labeled rows required)
npm run routing:train-p-success -- --input path/to/export.jsonl --output config/p-success-weights.json

# Or regenerate the checked-in dogfood weights from the synthetic fixture:
npm run routing:train-p-success

# 3) Optional: merge isotonic into an existing calibration bundle (does not rewrite hydra/centroids)
npm run routing:train-p-success -- --input path/to/export.jsonl \
  --calibration-output config/routing-calibration.json

# Full Phase-3 bundle (also refreshes standalone p-success-weights.json when the gate is met):
npm run routing:train-calibration -- --input path/to/aggregated.jsonl
```

Reload is file-based: replace `config/p-success-weights.json` (and optionally `config/routing-calibration.json` for isotonic) and restart the host agent — no prompt text is ever written into training artifacts.

**Isotonic gap:** serve-time isotonic calibration loads from `config/routing-calibration.json` (`isotonic_calibrator`). The checked-in dogfood path ships trained **logistic** weights only; isotonic is produced when you pass `--calibration-output` or run `routing:train-calibration` with ≥30 labeled samples. Until that bundle exists, the pipeline uses raw logistic `P(success)` (identity / no-op calibrator) and still exposes `p_success_raw` vs `p_success_calibrated` / `p_success_cheap` on explain and telemetry.

Library helpers (see `src/domain/routing/p-success-classifier.ts`):

- `trainFromExportJsonl(exportContent)` — fit coefficients from labeled JSONL
- `predictPSuccessCheap(features, weights)` — returns `P_success_cheap` in `[0, 1]`

**Minimum sample guidance:** collect at least **30** labeled economical-tier rows before relying on non-neutral predictions; below that threshold the classifier returns neutral `P_success_cheap = 0.5`. **Online inference** is active in the low-intensity gate; without trained weights the router uses neutral defaults until you add `config/p-success-weights.json`.

### Community telemetry contribution (calibration)

When `SMART_ROUTER_DATASET=1`, you can export privacy-safe scalar routing features (plus outcome labels) for community calibration training. The export never includes prompt text, messages, raw session identifiers, or install-local pepper fields.

```bash
/smart-router export telemetry-contrib [--limit N]
# or from shell (cwd must contain .pi-smart-router/state.db):
npx pi-smart-router export telemetry-contrib [--limit N]
```

This writes schema-valid JSON to `.pi-smart-router/exports/telemetry-contrib-<timestamp>.json`. Each row conforms to [`telemetry-contrib.schema.json`](specs/001-build-smart-router/contracts/telemetry-contrib.schema.json).

**How to contribute**

1. Opt in to dataset capture (`SMART_ROUTER_DATASET=1`) and dogfood with `/model smart-router/auto` for several sessions.
2. Run `export telemetry-contrib` locally and review the export — confirm it contains no prompt content.
3. Submit anonymized rows via **pull request** under `data/contrib/` (one `.json` array or `.jsonl` file per install) **or** attach the export to a [GitHub Discussion](https://github.com/beettlle/pi-smart-router/discussions) using the community telemetry template.
4. Maintainers aggregate contributions with `npm run routing:calibration-aggregate -- --contrib-dir data/contrib`; ingest rejects tainted payloads (prompt/message keys) and strips install-local pepper fields before offline training (SP-116, SP-117).

See the synthetic reference file at [`data/contrib/example.json`](data/contrib/example.json).

### OATS cluster centroid refinement (offline calibration)

**OATS** (outcome-aware cluster centroid refinement) shifts semantic cluster centroids during offline calibration toward cheap-tier **success** embeddings and away from loop-escalation **failure** embeddings. Refinement runs in Phase 3 of the calibration train path (`npm run routing:train-calibration`); it adds zero serving latency because refined centroids ship inside `config/routing-calibration.json`.

**Regeneration workflow**

1. Opt in to dataset capture (`SMART_ROUTER_DATASET=1`) and export contrib rows (`/smart-router export telemetry-contrib`).
2. Aggregate community rows: `npm run routing:calibration-aggregate -- --contrib-dir data/contrib`.
3. Train the bundle (includes OATS when enough labeled embeddings exist): `npm run routing:train-calibration -- --input <aggregated.jsonl>`.
4. Copy the output to `config/routing-calibration.json` (or your operator config path).
5. Verify artifact shapes and benchmark gates: `npm run routing:verify-calibration -- config/routing-calibration.json`.

At runtime, `ClusterMatcher` prefers `routing_centroids` from the calibration bundle when `config/routing-calibration.json` is present; otherwise it falls back to `config/routing-centroids.json` (bootstrap via `npm run routing:bootstrap-centroids`).

**Hyperparameters** (tunable in `scripts/lib/oats-centroid-refinement.ts` before train):

| Parameter | Default | Effect |
|-----------|---------|--------|
| `alpha` (α) | 0.15 | Attraction toward cheap-tier success embeddings |
| `beta` (β) | 0.08 | Repulsion from loop-escalation failures (keep β < α) |

**Minimum sample guidance**

| Guard | Default | Meaning |
|-------|---------|---------|
| Global `routing_centroids` | 10 rows | Labeled contrib rows with embeddings required before any OATS shift |
| `min_positive_samples` | 3 per cluster | Cheap-tier successes assigned to the cluster |
| `min_negative_samples` | 2 per cluster | Loop-escalation failures before repulsion term applies |

Below these thresholds the train path returns bootstrap centroids unchanged. The verify script reports `oats_refinement` metadata when refinement ran.

See [routing-roadmap.md](docs/routing-roadmap.md) §2 P2 OATS and GitHub [#77](https://github.com/beettlle/pi-smart-router/issues/77).

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
| `loop_escalation.threshold` | 3 | Consecutive identical failures before escalating to frontier. Also used as the default **zero-tier tool-call churn** threshold (SP-178 / [#99](https://github.com/beettlle/pi-smart-router/issues/99)): while pinned to `zero-tier`, unsupported/unknown tool results escalate immediately, and N `tool_result` turns escalate via the same `loop_escalation` pin path (FR-014) — not a cache-breakeven bypass |
| `pin_only_fallback` | `false` | Emergency pin-on-first-turn mode — see [Pin-only emergency fallback](#pin-only-emergency-fallback) |
| `local_zero.enabled` | `true` | When `false`, skip `local_zero` dispatch (fall through to later stages). Default keeps the cheap local path for true trivial traffic |
| `local_zero.max_tool_use_requirement` | `0.25` | Ceiling (0–1) on cheap predicted tool_use for `local_zero`. Effective limit is `min(local model tool_use, this value)`. Skips agentic git/bash/edit/explore/delete/repo cues with telemetry reason `tool_use_capability_shortfall` (SP-177 / [#98](https://github.com/beettlle/pi-smart-router/issues/98)) |
| `local.min_memory_gb_full` | 16 | Minimum RAM for full local inference |
| `local.battery_threshold_pct` | 20 | Minimum battery to allow local inference |
| `pricing.staleness_days` | 14 | Max age before re-fetching pricing data |

### Pin-only emergency fallback

**Not the default policy.** Multi-stage routing remains the design target. Enable `pin_only_fallback` only when shadow quality retention regresses or as a manual operator safety valve (GitHub [#83](https://github.com/beettlle/pi-smart-router/issues/83), [routing-roadmap.md](docs/routing-roadmap.md) §1).

When `pin_only_fallback` is `true` in `config/operator-config.json`:

1. **First turn** — normal multi-stage routing runs and establishes the session pin.
2. **Subsequent turns** — the router reuses the pinned model, skipping `turn_envelope`, triage, HyDRA, and sub-routing (`reason_code: pin_only_fallback`).

**Manual trigger:** set `"pin_only_fallback": true` in operator config and restart or reload config. Revert to `false` when shadow metrics recover.

**Automated trigger (eval harness):** compare shadow QR from `npm run routing:eval-harness` against a frozen baseline aggregate. When mean quality retention drops more than **5 percentage points** (default threshold), enable pin-only fallback:

```bash
# Score current fixtures
npm run routing:eval-harness:smoke > shadow-metrics.json

# Compare against a saved baseline (same catalog_id + checkpoint_date)
node --import tsx -e "
import { readFileSync } from 'node:fs';
import { evaluatePinOnlyFallbackFromHarness } from './scripts/eval/quality-retention.ts';
const shadow = JSON.parse(readFileSync('shadow-metrics.json','utf8')).tracks.capability;
const baseline = JSON.parse(readFileSync('baseline-metrics.json','utf8')).tracks.capability;
const result = evaluatePinOnlyFallbackFromHarness(shadow, baseline);
console.log(JSON.stringify(result, null, 2));
if (result.pin_only_fallback) process.exit(2);
"
```

Exit code `2` signals regression above threshold — operators can wire this into CI or a config reload hook. Override semantics: explicit `pin_only_fallback: true` in config always enables emergency mode; explicit `false` disables the automated recommendation.

**Telemetry:** when fallback routes a request, telemetry rows include `pin_only_fallback_active: true` (and `reason_code: pin_only_fallback`). Filter operator audit logs on that field to confirm emergency mode is active.

### HyDRA model cache

The embedding matcher uses `@huggingface/transformers` with ONNX models (384-dim embeddings). Artifacts are downloaded at runtime and cached under `.pi-smart-router/models/` (configurable via `hydra.artifact_cache_path`). This directory is gitignored.

**Abort / cancel limitation (SP-171):** `AbortSignal` is checked at phase boundaries before fleet refresh, HyDRA/dispatch, planning delegate, and each failover iteration. Mid-ONNX embedding inference cannot be cancelled — abort is fail-fast only before or after that stage, not during an in-flight ONNX run.

| Encoder | Model | Context | Default |
|---------|-------|---------|---------|
| `minilm` | `Xenova/all-MiniLM-L6-v2` | 512 tokens | yes |
| `granite` | `ibm-granite/granite-embedding-97m-multilingual-r2` (ONNX) | long context | trial (#80) |

Set the encoder in operator config:

```json
{
  "hydra": {
    "artifact_cache_path": ".pi-smart-router/models/",
    "encoder": "granite"
  }
}
```

MiniLM remains the default fallback when `encoder` is omitted. Both encoders produce 384-dim vectors compatible with the SP-115 learned projection head.

**Latency budget:** the HyDRA embedding stage targets ~80–120 ms per turn. Compare MiniLM vs Granite on held-out agent turn samples:

```bash
npm run benchmark:encoder
# optional: --fixtures path --cache .pi-smart-router/models/
```

The script reports p50/p95 latency for each encoder and asserts Granite p50/p95 stay within the 120 ms budget ceiling. Requires `@huggingface/transformers` and a one-time ONNX artifact download.

## Architecture

### Three execution tiers

| Tier | Catalog Name | Purpose | Example |
|------|-------------|---------|---------|
| Local | `zero-tier` | Free on-device inference for trivial tasks | Gemma via LM Studio |
| Cheap Cloud | `economical-cloud` | Budget API models for routine work | Claude Haiku |
| Frontier Cloud | `frontier-cloud` | Top-tier models for complex reasoning | Claude Sonnet |

### Pi extension

The pi integration path (npm install or project-local clone):

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

### Troubleshooting

#### Gemini `thought_signature` 400 errors

If Gemini returns **400 INVALID_ARGUMENT** mentioning `thought_signature`, the router treats this as a **protocol validation error** (incomplete tool-call replay), not provider unavailability — it will **not** failover to another model.

See [Google's thought signatures documentation](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).

**Primary fix — replay repair (SP-127/128):** before every Google-target delegation, smart-router repairs tool-call replay state: prior turns keep captured `thoughtSignature` values; tool calls missing a signature receive the Google-accepted skip sentinel so pi-ai can replay without a 400. Typical Gemini-first tool loops on `/model smart-router/auto` no longer require `/new` or switching away from Google models.

**Narrowed guard fail-safe (SP-129):** sessions with **unrepairable** Google-origin replay state (e.g. redacted thinking blocks paired with tool calls) exclude Gemini from routing (`reason_code: gemini_tool_history_excluded`) unless the operator sets `force_model_id` via `/model`. Repairable Google tool history is delegated normally.

**Empty fleet fail-safe (SP-084):** when the guard filters every model in the scoped fleet (e.g. Google/Gemini-only dogfood configs with unrepairable replay risk), the router throws an actionable error instead of delegating with `selected_model_id: unknown`. Add a non-Google model such as `openai/gpt-4o-mini` or `cursor/auto` to the fleet, start `/new`, or pin `/model` to force a specific model.

**If you still see a `thought_signature` error:**

1. Start a fresh session with `/new` in pi (clears unrepairable history).
2. Switch to a non-Google model (e.g. `/model openai/gpt-4o-mini`) for that session.
3. Upstream: [pi#6342](https://github.com/earendil-works/pi/issues/6342) tracks pi preserving thought signatures in session replay; smart-router repair covers the common cross-model routing case without waiting on that fix.

Related: [pi-smart-router#37](https://github.com/beettlle/pi-smart-router/issues/37), [pi-smart-router#38](https://github.com/beettlle/pi-smart-router/issues/38), [pi-smart-router#40](https://github.com/beettlle/pi-smart-router/issues/40), [pi-smart-router#41](https://github.com/beettlle/pi-smart-router/issues/41), [pi-smart-router#85](https://github.com/beettlle/pi-smart-router/issues/85).

### Explain endpoint (library API)

The explain handler runs the identical pipeline but returns the `RoutingDecision` without dispatching upstream inference — guaranteeing bit-for-bit decision equivalence with the live path. Useful for debugging, operator trust, and shadow runs. Exposed via the library API (`src/api/explain/router-explain.ts`); HTTP/CLI wiring is embedder-specific.

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
npm run verify:ci
```

Contributors must run `npm run build` before publishing or consuming the library API from `dist/`. The pi extension uses TypeScript source directly (via pi's jiti loader) and does not require a local build for clone-based dogfooding.

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile library to `dist/` (`tsc --project tsconfig.build.json`) |
| `npm run release:check` | Pre-release gate: `verify:ci` + consumer pack + Tier 0 functional smoke |
| `npm run release:functional-smoke` | Tier 0 functional smoke: calibration verify (`--skip-embed`), benchmark profiles, release gate assertions |
| `npm run release:consumer-pack` | Pack tarball and verify production dependencies resolve (catches missing runtime deps) |
| `npm run verify:ci` | Full CI parity: build, typecheck, lint, test, coverage |
| `npm run typecheck` | TypeScript strict mode check (`tsc --noEmit`) |
| `npm test` | Run test suite (`vitest run`) |
| `npm run coverage:check` | Tests with line-coverage thresholds |
| `npm run lint` | ESLint + fleet catalog validation |
| `npm run routing:bootstrap-centroids` | Regenerate `config/routing-centroids.json` from cluster catalog |
| `npm run routing:calibration-aggregate` | Aggregate community telemetry for calibration |
| `npm run routing:train-calibration` | Train routing calibration artifact bundle |
| `npm run routing:train-p-success` | Train standalone `config/p-success-weights.json` (synthetic fixture by default) |
| `npm run routing:verify-calibration` | Verify calibration bundle against benchmark prompts |
| `npm run routing:ingest-benchmarks` | Regenerate `config/benchmark-profiles.json` from leaderboard fixtures |
| `npm run routing:verify-benchmark-profiles` | CI smoke: assert checked-in profiles match fixture ingest |
| `npm run routing:eval-replay` | Counterfactual replay on eval trace fixtures |
| `npm run routing:eval-harness` | Three-track eval harness (capability, cost, continuity) on fixture traces |
| `npm run routing:eval-harness:smoke` | Harness summary JSON only (CI smoke; no network) |
| `npm run benchmark:encoder` | Compare MiniLM vs Granite encoder latency on held-out agent turns |

### Offline eval harness (agent-native routing)

The eval harness scores routing decisions on **fixture traces** — multi-turn agent sessions with step-level `prefix_hash` identifiers and frozen model catalog metadata. Fixtures live under `tests/eval/fixtures/` (native eval trace JSON) and `tests/eval/fixtures/twinrouterbench/` (TwinRouterBench-compatible static track format adapted at load time).

**Frozen catalog rule:** every published QR/CS number must cite `catalog_id` + `checkpoint_date` from the fixture's `frozen_catalog` block (see `docs/routing-roadmap.md` §5).

Run locally:

```bash
# Full metrics JSON (per-fixture + aggregate track summaries)
npm run routing:eval-harness

# CI-style summary only
npm run routing:eval-harness:smoke

# Custom fixture directory (includes TwinRouterBench static track subdirs)
npm run routing:eval-harness -- --fixtures tests/eval/fixtures

# Counterfactual replay only (SP-151)
npm run routing:eval-replay
```

**CI smoke:** `.github/workflows/eval-harness-smoke.yml` runs on PRs that touch eval scripts, fixtures, or the workflow. It executes `routing:eval-harness:smoke` and eval unit tests — fast, offline, no provider network calls.

**TwinRouterBench static track:** import step-level router-visible prefixes with execution-verified target tiers (`track: "static"`). The adapter in `scripts/eval/twinrouterbench-adapter.ts` converts static track records into native eval fixtures for the three-track harness. See `docs/gemini-research.md` §9 for methodology context.

### Benchmark profile refresh

Capability scores in `config/benchmark-profiles.json` are grounded from public leaderboard snapshots under `tests/fixtures/benchmark-leaderboards/` (and optional **recorded** live snapshots under `tests/fixtures/benchmark-leaderboards/recorded/`). Each artifact records provenance (`source_urls`, `scrape_date`, `catalog_freeze_date`) in its header.

**Fleet ID aliases (SP-174):** live pi/Cursor scoped-fleet model IDs often differ from leaderboard `model_id` strings. The artifact’s optional `aliases` map sends those fleet IDs to an existing grounded row (never invents scores). `mapPiModelToProfile` sets `capability_source` to `benchmark` when a direct row or alias hits, otherwise `pattern_default`. Operators can also call `getCapabilitySource(modelId)` / `resolveBenchmarkModelId(modelId)`.

**Add a new fleet ID after ingest:**

1. Ensure the canonical model has fixture scores (edit `tests/fixtures/benchmark-leaderboards/*.json` if needed).
2. Run `npm run routing:ingest-benchmarks` (and commit the regenerated `config/benchmark-profiles.json`).
3. Add `"your-fleet-id": "canonical-model_id"` under `aliases` in `config/benchmark-profiles.json` (target must already appear in `models[].model_id`).
4. Re-run ingest anytime — the CLI **preserves** existing `aliases` from the output file. Seed defaults live in `DEFAULT_FLEET_BENCHMARK_ALIASES` when no prior artifact exists.
5. Confirm with `npm run routing:verify-benchmark-profiles` and a mapper unit test that `capability_source === 'benchmark'` for the fleet id.

**Operator refresh command (SP-179 / SP-180):**

| Mode | Command | Network? | When to use |
|------|---------|----------|-------------|
| **Fixtures (default)** | `npm run routing:ingest-benchmarks` | No | Local edits, CI, PR smoke |
| **Recorded replay** | `npm run routing:ingest-benchmarks -- --recorded` | No | Replay last successful live snapshots offline |
| **Live + record** | `npm run routing:ingest-benchmarks -- --live` | Yes | Operator refresh; writes `tests/fixtures/benchmark-leaderboards/recorded/` then regenerates profiles |

Optional flags: `--catalog-freeze-date YYYY-MM-DD`, `--scrape-date YYYY-MM-DD`, `--record-dir DIR`, `--live-url BENCHMARK=URL`, `--output PATH`. See `npm run routing:ingest-benchmarks -- --help`. Live adapters require fixture-shaped JSON; HTML pages fail fast and leave `config/benchmark-profiles.json` unchanged.

**Cadence (linked to CI):**

| Trigger | Schedule / action | Behavior |
|---------|-------------------|----------|
| **Monthly** | cron `0 6 1 * *` (1st of each month, 06:00 UTC) in `.github/workflows/benchmark-profile-refresh.yml` | Attempt **live** ingest; on failure fall back to checked-in fixtures; open a bot PR when model scores change (includes updated recorded snapshots when live succeeds) |
| **Manual dispatch** | Actions → *Benchmark Profile Refresh* → `workflow_dispatch` (`use_live` default `true`) | Same live-or-fixture path; set `use_live=false` for fixtures-only |
| **PR smoke** | PRs touching fixtures / ingest / artifact / workflow | **Fixtures only** — `npm run routing:verify-benchmark-profiles` (offline, no network) |

**Operator policy:**

1. **PR smoke** — fixture-only verify so PRs never require live network.
2. **Monthly / dispatch refresh** — live with fixture fallback; provenance (`source_urls`, `scrape_date`, `catalog_freeze_date`) is preserved in the artifact header and echoed in the bot PR body.
3. **Manual local updates** — prefer fixtures or `--recorded` for offline work; use `--live` when refreshing from public leaderboard JSON endpoints.

Verify after any regenerate:

```bash
npm run routing:ingest-benchmarks
# or: npm run routing:ingest-benchmarks -- --live
# or: npm run routing:ingest-benchmarks -- --recorded
npm run routing:verify-benchmark-profiles
```

### Releasing

Tag-triggered publish via GitHub Actions (requires `NPMSECRET` repository secret). pi.dev gallery listing syncs automatically from npm (`pi-package` keyword); no separate submit step.

**Tier 0 functional smoke** (`release:functional-smoke`) runs before tag publish and chains:

1. `routing:verify-calibration --skip-embed` — artifact shape + triage benchmark gates (no ONNX embedding)
2. `routing:verify-benchmark-profiles` — checked-in capability profiles match fixture ingest
3. `assert-release-gates --fixtures tests/eval/fixtures --baseline-version 0.6.0` — eval harness aggregate metrics vs `config/release-gates.json` and semver baseline regression vs `tests/eval/baselines/v0.6.0.json`

`release:check` runs the full pre-release path: `verify:ci`, consumer pack verify, then Tier 0 functional smoke.

**Baseline re-capture (post-tag):** after shipping a new semver (e.g. v0.7.0), freeze harness metrics for the next regression reference:

```bash
# Capture aggregate metrics from current fixtures (writes tests/eval/baselines/v0.7.0.json)
npm run routing:capture-baseline -- --version 0.7.0

# Point release gates at the new reference (config/release-gates.json + release:functional-smoke --baseline-version)
```

Commit the new baseline JSON and update `baseline_regression.reference_version` in `config/release-gates.json` plus the `--baseline-version` flag in `release:functional-smoke`. Re-run `npm run release:check` before tagging the next release.

1. `npm run release:check` (CI parity + consumer pack + Tier 0 functional smoke)
2. `npm version 0.1.1` (creates commit + `v0.1.1` tag)
3. `git push && git push --tags`
4. Actions → **Release** runs pack smoke, consumer pack verify, Tier 0 functional smoke, `npm publish`, and creates a GitHub Release

Re-publish a failed release: Actions → Release → Run workflow with existing tag (e.g. `v0.1.1`).

Dry-run tarball contents locally:

```bash
npm run release:check
npm pack --dry-run
```

**Post-publish smoke (manual, macOS):** CI does not run `pi install`. After publish:

```bash
pi install npm:pi-smart-router@0.1.1
pi --list-models | grep smart-router
# in pi: /model smart-router/auto, /smart-router status
```

Confirm https://pi.dev/packages/pi-smart-router shows the new version (may lag npm by a few minutes).

### Test suite

1117 tests across 61 test files covering:

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
| [config/routing-clusters.yaml.example](config/routing-clusters.yaml.example) | Routing cluster reference-prompt catalog (library API) |

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
