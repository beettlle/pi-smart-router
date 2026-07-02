# Feature Specification: Auto-Model Router MVP

**Feature Branch**: `001-build-smart-router`  
**Created**: 2026-07-02  
**Status**: Draft  
**Input**: User description: "Build pi-smart-router MVP: an open-source auto-model router for the pi.dev coding agent that intercepts each LLM request and selects the best execution tier (local when viable, economical cloud, or frontier cloud) to balance cost, capability, latency, and time-to-first-token without manual model picking."

## Clarifications

### Session 2026-07-02

- Q: When a session is pinned to a frontier-capable model, should small tool-result turns be allowed to sub-route to an economical tier? → A: Same-provider sub-routing only — small tool-result payloads may use an economical tier when the economical model shares the same provider as the pin.
- Q: When the centralized session store is unavailable, how should session pinning behave? → A: *(Amended)* Default SQLite file store at `.pi-smart-router/state.db` via better-sqlite3; shared across single-host multi-process. In-memory fallback for unit tests only when SQLite is explicitly disabled.
- Q: What scope should rate limits apply to? → A: Per operator API key — limits keyed to the credential used for upstream calls.
- Q: When routing fails entirely, which tier should the safe default use? → A: Economical first — select first healthy economical-cloud model; frontier only if none available.
- Q: How long should routing telemetry be retained for operator audit? → A: Rolling window capped at 168 hours and 1111 records.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Automatic Model Selection (Priority: P1)

A developer using the pi coding agent sends varied prompts during a work session. The router transparently intercepts each request and selects an execution tier without the developer manually choosing a model for every turn.

**Why this priority**: This is the core value proposition—automatic routing replaces manual model picking and must work before any optimization layer matters.

**Independent Test**: Send a mixed set of agent requests through pi with the router enabled; verify each request receives a tier assignment and completes without manual model configuration.

**Acceptance Scenarios**:

1. **Given** the router is enabled and a model fleet is configured, **When** the developer sends any agent request, **Then** the router selects a tier and model before inference begins.
2. **Given** the router is enabled, **When** the developer does not specify a model, **Then** the agent session continues without interruption and receives a response from the selected tier.

---

### User Story 2 - Fast-Path Triage for Obvious Tasks (Priority: P2)

A developer submits clearly trivial tasks (formatting, linting, simple tests) or clearly complex tasks (architecture, debugging, system design). The router assigns economical or frontier tiers respectively without perceptible routing delay on the obvious cases.

**Why this priority**: Most agent traffic is routine; fast triage delivers immediate cost and latency wins without waiting for deeper analysis.

**Independent Test**: Submit a curated set of trivial vs. complex prompts; verify tier assignments match intent categories without operator override.

**Acceptance Scenarios**:

1. **Given** a prompt clearly requesting a trivial structural task, **When** the router evaluates it, **Then** the request routes to an economical or local tier.
2. **Given** a prompt clearly requesting deep reasoning or architecture work, **When** the router evaluates it, **Then** the request routes to a frontier tier.
3. **Given** an obvious-case prompt, **When** routing completes, **Then** the developer does not perceive added wait time before the first token.

---

### User Story 3 - Turn-Aware Routing Within Pin Rules (Priority: P2)

During an agent session, different turn types occur—planning messages, tool results, subagent exploration. The router considers message role, tool context, and payload shape—not only raw prompt text—when selecting tier within session pinning rules.

**Why this priority**: Agent workloads are multi-turn and heterogeneous; text-only routing misses the dominant signal in many turns.

**Independent Test**: Simulate a session with planning turns and small tool-result payloads; verify turn context influences tier bias while respecting pin policy.

**Acceptance Scenarios**:

1. **Given** a session pinned to a capable tier for planning on a provider, **When** a small tool-result turn arrives on that same provider, **Then** the router may assign an economical-tier model from that provider; **When** the tool-result exceeds the size threshold or no same-provider economical model exists, **Then** the router uses the pinned model.
2. **Given** a planning or architecture turn, **When** no pin exists yet, **Then** the router biases toward a frontier-capable tier.
3. **Given** a subagent or exploration turn, **When** routing runs, **Then** the router biases toward a mid-tier capable of context gathering.

---

### User Story 4 - Session Pinning for Cache Efficiency (Priority: P3)

A developer works through a multi-turn agent conversation without history compaction. The router keeps the session on the same model to preserve provider context caching until a qualified pin-break event occurs.

**Why this priority**: Switching models every turn destroys cache economics and can increase cost more than routing saves.

**Independent Test**: Run a multi-turn conversation without compaction; verify the pinned model stays consistent across turns until a defined break event.

**Acceptance Scenarios**:

1. **Given** a new session's first routing decision, **When** subsequent turns arrive without compaction, **Then** the session remains pinned to the same model.
2. **Given** a pinned session, **When** history compaction occurs, **Then** the router may re-evaluate and select a new model.
3. **Given** a pinned session, **When** the developer explicitly overrides the model, **Then** the pin updates to the forced model for the session remainder.
4. **Given** a provider switch is considered, **When** cache-warmup cost exceeds projected savings, **Then** the router keeps the current pin.
5. **Given** multiple pi or spine processes on the same host, **When** routing runs, **Then** session pins and rate limits are read from the shared SQLite state store without requiring an external server.

---

### User Story 5 - Local Tier When Machine and Model State Allow (Priority: P4)

A developer on supported Apple Silicon hardware with sufficient memory and power runs optional local inference services. The router uses the local tier only when the machine state and loaded-model state support it; otherwise it falls back instantly without blocking the developer.

**Why this priority**: Local inference is free when viable but must never degrade time-to-first-token or crash the agent when services are unavailable.

**Independent Test**: Exercise scenarios with adequate vs. constrained hardware, battery, and loaded-model state; verify local tier is used only when viable and fallback is immediate otherwise.

**Acceptance Scenarios**:

1. **Given** sufficient memory, power, and a ready local model, **When** a trivial task is routed, **Then** the local tier may be selected.
2. **Given** low battery on unplugged power, **When** routing runs, **Then** the local tier is disabled and a cloud tier is selected.
3. **Given** no local model is loaded and ready, **When** routing would use local tier, **Then** the router immediately selects an economical cloud tier without waiting for local cold start.
4. **Given** local services are unreachable, **When** routing runs, **Then** the agent continues without error and a cloud tier is used.

---

### User Story 6 - Routing Explainability and Audit (Priority: P3)

A developer or operator wants to understand why a specific request was routed to a particular tier. They query routing rationale without triggering upstream inference.

**Why this priority**: Trust and tuning require visibility into decisions; operators cannot improve routing they cannot inspect.

**Independent Test**: Submit a request to the explain path; verify response includes tier, stage, reason, and alternatives without dispatching inference.

**Acceptance Scenarios**:

1. **Given** a routing request payload, **When** the operator requests an explanation, **Then** the system returns tier, decision stage, reason code, and considered alternatives without executing inference.
2. **Given** a live routed request, **When** the operator audits recent decisions, **Then** per-request telemetry includes cost estimate, routing duration, and pin reason, and remains queryable within the rolling retention window.

---

### User Story 7 - Loop Rescue and Cost Preference (Priority: P4)

A developer configures a cost-vs-quality preference. When a session becomes stuck in repeated identical tool failures on an economical tier, the router escalates to a higher tier for the session remainder without judging generated output quality.

**Why this priority**: Economical tiers can loop on hard tasks; observational rescue restores progress without post-generation cascading latency.

**Independent Test**: Simulate repeated identical tool failures; verify pin escalates once and remains on the higher tier. Separately, change cost preference and verify cheaper vs. capable routing shifts.

**Acceptance Scenarios**:

1. **Given** repeated identical tool failures within a bounded window, **When** the threshold is exceeded, **Then** the session pin escalates to a frontier-capable tier for the remainder of the session.
2. **Given** an escalated session, **When** subsequent turns arrive, **Then** the pin does not oscillate back to the economical tier without a qualified break.
3. **Given** the operator sets a higher cost-savings preference, **When** ambiguous prompts are routed, **Then** economical tiers are favored at quality parity.
4. **Given** pricing data is older than the configured staleness threshold, **When** the router initializes, **Then** the operator receives a proactive reminder to refresh rates.

---

### Edge Cases

- Machine has minimal unified memory: local tier limited to classification-only; full local execution disabled.
- Developer on battery below threshold while unplugged: local tier disabled.
- Neither configured local service has a model ready: immediate economical cloud fallback.
- Code structure in prompt cannot be parsed: safe default per FR-022; agent does not crash.
- Adversarial complexity inflation in prompt content: sanitization prevents over-routing to frontier.
- SQLite state store unavailable (corrupt or missing file): recreate store or fall back to in-memory for current process only; MUST NOT crash host agent.
- Provider returns infrastructure error: automatic retry on equivalent tier; policy or safety rejections do not trigger failover.
- Tool-result sub-routing attempted when payload exceeds size threshold or economical model is on a different provider: session stays on pinned model.
- Tool-result sub-routing to same-provider economical model: pin record unchanged; provider cache markers preserved.
- Rate limit exceeded for an operator API key: request rejected with retry guidance; other operators unaffected.
- Loop escalation fires once per session; no tier oscillation.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST intercept every pi agent LLM request and select an execution tier before inference begins.
- **FR-002**: System MUST support three execution tiers: local (when viable), economical cloud, and frontier cloud.
- **FR-003**: System MUST perform deterministic fast-path triage for obviously trivial vs. obviously complex prompts before deeper matching.
- **FR-004**: System MUST sanitize prompts for adversarial complexity inflation before scoring.
- **FR-005**: System MUST classify agentic turn context (message role, tool presence, payload shape) as a routing signal.
- **FR-006**: System MUST pin a session to one model after the initial routing decision until a qualified pin-break event.
- **FR-007**: System MUST NOT re-optimize provider or model on every turn solely for cost savings.
- **FR-008**: System MUST allow pin breaks only at history compaction, explicit operator override, qualified loop escalation, or when cache-warmup economics justify a switch.
- **FR-009**: System MUST match ambiguous prompts using multi-dimensional capability requirements against a configurable model fleet catalog.
- **FR-010**: System MUST optimize across cost, latency, and output verbosity at quality parity—not cost alone.
- **FR-011**: System MUST allow fleet catalog updates without retraining the routing matcher.
- **FR-012**: System MUST use local tier only when hardware, power state, and loaded-model readiness checks pass.
- **FR-013**: System MUST NOT invoke unloaded local models; MUST fall back without blocking time-to-first-token.
- **FR-014**: System MUST escalate session pin when bounded repeated identical tool failures are detected, without post-generation output judging.
- **FR-015**: System MUST provide routing explanation (tier, stage, reason, alternatives) without upstream inference dispatch.
- **FR-016**: System MUST emit per-request routing telemetry including decision stage, reason code, estimated cost, and routing duration; MUST retain audit records in a rolling window capped at 168 hours and 1111 records unless operator configures otherwise.
- **FR-017**: System MUST enforce rate limits per operator API key and distribute load across equivalent model endpoints.
- **FR-018**: System MUST fail over to alternate providers only on infrastructure errors, not on policy or safety rejections.
- **FR-019**: System MUST resolve model pricing from operator overrides, refreshed registry data, and catalog fallbacks in priority order.
- **FR-020**: System MUST warn the operator when pricing data exceeds a configurable staleness threshold.
- **FR-021**: System MUST accept an operator-configurable cost-vs-quality preference with a sensible default when unset.
- **FR-022**: System MUST degrade to a safe cloud default on any routing failure without crashing the host agent; safe default selects the first healthy economical-cloud model, falling back to frontier-cloud only when no economical model is available.
- **FR-023**: System MUST preserve provider context-caching semantics on same-provider request paths.
- **FR-024**: When a session is pinned, tool-result turns MAY sub-route to an economical tier only if the payload is below a configurable size threshold and the economical model shares the same provider as the pin; otherwise the pinned model MUST be used.
- **FR-025**: When the SQLite state store is unavailable, the system MUST fall back to in-process memory for the current process only; MUST NOT crash the host agent. Production path MUST use the shared SQLite store for cross-process pins and rate limits.

### Key Entities

- **RoutingRequest**: An intercepted agent request including prompt content, session identifier, turn context, and compaction flags.
- **SessionPin**: Session identifier, pinned model, pin reason, switch history, and upstream error counters.
- **ModelProfile**: Tier assignment, capability dimensions, performance characteristics, and pricing metadata for one fleet member.
- **RoutingDecision**: Selected tier and model, decision stage, reason code, alternatives considered, and estimated cost.
- **PriceCatalog**: Registry rates, operator overrides, fallback baselines, and last-updated timestamp.
- **RoutingTelemetry**: Audit record for a single routing event linking request, decision, duration, and pin state.

### Assumptions

- **Tier naming:** User-facing "local tier" maps to catalog tier `zero-tier` in models.yaml, JSON schemas, and telemetry. Economical and frontier tiers map to `economical-cloud` and `frontier-cloud`.
- MVP targets developers on macOS Apple Silicon.
- Operator maintains a model fleet catalog with at least one model per tier.
- Local inference services are optional; the router does not mandate them.
- Operator configures cost preference via pi configuration; balanced default applies when unset.
- Default state store is a SQLite file at `.pi-smart-router/state.db` (project-relative), shared across single-host multi-process pi and spine workers; no external server required.
- In-memory store is used for unit tests only when SQLite is explicitly disabled.
- Distributed multi-host deployments may use an optional Redis store adapter (post-MVP); not required for MVP.
- Pricing staleness reminder defaults to fourteen days unless operator configures otherwise.
- Loop escalation threshold defaults to three identical tool failures within a session unless operator configures otherwise.
- Tool-result sub-routing payload threshold defaults to two kilobytes unless operator configures otherwise.
- Rate limits are scoped per operator API key unless operator configures otherwise.
- Safe default on routing failure: see FR-022.
- Routing telemetry retention defaults to a rolling window of 168 hours and 1111 records unless operator configures otherwise.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Developers complete agent sessions without manually selecting a model for each request when the router is enabled.
- **SC-002**: At least 95% of clearly trivial prompts in a curated test set route to economical or local tiers without operator override.
- **SC-003**: Clearly complex architecture and debugging prompts in a curated test set route to frontier-capable tiers.
- **SC-004**: Obvious-case routing (Step 2 triage early exit) adds less than 5ms median routing overhead before first-token dispatch.
- **SC-005**: Median routing overhead for ambiguous prompts remains under two hundred milliseconds. Acceptance proxy: median <200ms in `tests/integration/routing-latency.test.ts` (task T061).
- **SC-006**: Multi-turn sessions without compaction keep the same pinned model across non-sub-routable turns; same-provider tool-result sub-routing does not break session pin state.
- **SC-007**: Zero host-agent crashes when local inference services are unavailable or misconfigured.
- **SC-008**: Operators can retrieve routing rationale for requests within the rolling retention window (default 168 hours and 1111 records) without replaying traffic through upstream inference.
- **SC-009**: Mixed-workload API cost measurably decreases versus an always-frontier baseline in a representative agent workload.
- **SC-010**: Routing decisions on identical inputs produce identical explanations on the explain path and live path.

## Out of Scope

- Native on-device inference frameworks beyond HTTP local backends (post-MVP).
- Windows, Linux, and non-Apple-Silicon macOS support (post-MVP).
- Turn-by-turn provider switching without qualified pin-break rules.
- Post-generation cascading or output-quality judging for escalation.
- RL-trained routers on agent traces.
- Semantic caching per intent cluster.
- Managed hosted router service operated by a third party.
