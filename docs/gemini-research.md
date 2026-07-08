# Research Brief: Improving Pre-Generation LLM Routing Quality for Coding Agents (pi-smart-router)

> **Document role:** This file is a **research source**, not the implementation backlog.  
> **Actionable priorities:** [`routing-roadmap.md`](routing-roadmap.md)  
> **Parallel research:** [`research/routing-quality-2026-07.json`](research/routing-quality-2026-07.json)  
> **Index:** [`research/README.md`](research/README.md)  
> The body below is preserved as authored; do not treat it as the single source of truth for sequencing work.

## Executive Summary

The proliferation of heterogeneous large language model (LLM) pools has shifted the performance bottleneck of agentic coding systems from raw model capabilities to intelligent orchestration. This report evaluates the architectural viability and optimization pathways for pi-smart-router, an open-source pre-generation router that intercepts agent turns across a three-tier model hierarchy (local zero-tier, economical cloud, and frontier cloud).

### Explicit Answer on Viability

Multi-stage, pre-generation routing is highly viable for coding agents, and pi-smart-router should definitively **not** pivot to a simpler "pin-on-first-turn" policy. The evidence demonstrates that a static pin policy is economically inefficient, forcing expensive models to handle trivial tasks (which constitute 60–70% of standard agentic workloads) simply because they were selected for an initial complex prompt. Conversely, post-generation cascading (e.g., FrugalGPT) is entirely unsuited for interactive agents due to unacceptable tail latency. Pre-generation routing represents the mathematically optimal abstraction, provided it incorporates strict cache-awareness and sequential state modeling.

To address the known failure modes within pi-smart-router, this analysis identifies several critical optimization vectors that reconcile theoretical routing efficiency with the practical constraints of production agent ecosystems:

- The tension between planning-turn envelopes and session pinning must be resolved through an **ephemeral sub-agent architecture** rather than an in-place session swap, preserving the 90% prompt-cache discount.
- The embedding architecture must transition from MiniLM to a modern distilled encoder (such as Granite 97M) to support extended context windows up to 8,192 tokens.
- Static capability scores must be replaced by dynamic, benchmark-grounded profiles derived from Abstract Syntax Tree (AST) validation on environments like Terminal-Bench 2.0.

Crucially, the raw probability of success, $P(\text{success})$, must be recalibrated. Current uncalibrated confidence scores yield high Expected Calibration Error (ECE); applying isotonic regression to historical tool-failure loops can reduce ECE from 0.12 to 0.03, enabling mathematically sound thresholding. Finally, to navigate subscription quota economics, the router must model the agent session as a finite-horizon Markov Decision Process (MDP), applying Hindsight Budget Relabeling (HBR) to learn delayed gratification and conserve frontier API limits for late-stage synthesis turns.

---

## 1. The Viability of Multi-Stage Pre-Generation Routing

The central architectural question for pi-smart-router is whether a full multi-stage pre-generation router is the correct abstraction, or whether a simpler policy (pinning the session on the first turn and escalating only upon a loop failure) is superior. The empirical evidence unequivocally supports the multi-stage pre-generation router, contingent upon strict cache-awareness.

Generate-then-judge cascades, such as the architecture proposed in FrugalGPT, operate by generating a response with a small model, analyzing the output via a judge model or internal confidence metric, and escalating to a larger model if the output is deemed insufficient. While this cascading escalation is theoretically cost-optimal for asynchronous batch processing, it inherently violates the hard latency constraints of interactive coding agents. A single cascade escalation introduces a Time-To-First-Token (TTFT) penalty ranging from 500 to 2,000 milliseconds. In an agentic loop executing dozens of autonomous terminal commands or tool calls sequentially, compounding cascade latencies degrade the user experience to the point of unusability.

Unified optimization research comparing cascades and pre-generation routers indicates that:

| Approach | Latency | Requirement |
|----------|---------|-------------|
| **Cascades** | Severe latency tax (sequential calls) | No accurate upfront complexity classifier |
| **Pre-generation routers** | Near-zero overhead (typically 5–100 ms) | Highly accurate predictor |

For coding agents, where 60% to 70% of production traffic consists of structurally simple completions (e.g., syntax formatting, localized file reading, simple tool execution), a highly accurate pre-generation router is the dominant strategy. The "pin-on-first-turn" policy fails because it fundamentally mischaracterizes the topology of an agent session, which fluctuates wildly in complexity from turn to turn.

---

## 2. Resolving Architectural Tensions: Turn Envelope vs. Session Pinning

A known failure mode in the current pipeline is the tension between the "turn envelope" stage and the "session pin" stage. Currently, the turn envelope early-exits to the frontier tier on planning turns (detected via regex for terms like "plan," "design," "architecture") before the session pin is evaluated. This violently disrupts cache-aware pinning, over-routing the system to frontier models and obliterating the massive economic benefits of provider-side KV caching.

The cost model of every major provider is built around prompt caching (e.g., RadixAttention in vLLM or Anthropic's prompt caching), which offers up to a **90% discount** on input tokens for repeated prefixes. If a router evaluates an agent's tenth turn and determines that an economical model is sufficient, but the preceding nine turns were processed by a frontier model, switching models results in a catastrophic cache miss. The agent must re-transmit the entire multi-thousand-token system prompt, repository map, and conversation history to warm the new model's cache. The cost of this cache miss frequently exceeds the marginal savings of using the cheaper model for that specific turn.

Production coding agents navigate this tension through **hierarchical sub-agent routing** rather than in-place session swapping. Systems like Cursor Auto, Claude Code, and proxy routers like Weave Router do not change the underlying model of the primary contextual loop for a single planning task. When the turn envelope detects a high-stakes planning turn, the optimal action is to spawn an **ephemeral sub-agent** on the frontier model:

1. Extract only the necessary contextual state (e.g., the specific file diffs and the user's architectural request), excluding the massive execution history.
2. Pass this compressed context to the frontier sub-agent at full price.
3. Inject the sub-agent's output back into the primary agent's context as a standard observation message.

By offloading the high-complexity turn to an independent sub-agent, the primary session remains pinned to the economical model, preserving the continuous context cache while still leveraging frontier-level reasoning.

---

## 3. HyDRA Fidelity: Encoder Architectures for Agent Routing

The pi-smart-router currently utilizes MiniLM-L6-v2 projecting from 384 dimensions down to a 3-dimensional requirement space. While MiniLM is highly optimized for latency, its architecture is fundamentally unsuited for agentic coding workflows due to its strict **512-token context limit**. Agent prefixes—comprising system instructions, repository maps, and prior tool observations—routinely exceed this limit, forcing truncation that strips the semantic router of the very context it needs to assess task complexity.

### Transitioning to ModernBERT Architectures

The GitHub Copilot HyDRA architecture successfully resolved this by leveraging a ModernBERT encoder. ModernBERT utilizes sequence packing, rotary position embeddings (RoPE), and alternating local and global attention layers to efficiently process context windows up to 8,192 tokens without the quadratic scaling costs of traditional dense attention.

For pi-smart-router to maintain its 80–120 ms latency budget for local embeddings, it should upgrade to a distilled modern architecture, such as `ibm-granite/granite-embedding-97m-multilingual-r2`. This 97M-parameter model:

- Is built on the ModernBERT backbone
- Produces 384-dimensional outputs
- Ships with optimized ONNX weights (98 MB)
- Handles extended contexts with minimal latency overhead while outperforming MiniLM across code retrieval benchmarks

### Shortfall Matching and Projection Mechanics

The GitHub Copilot HyDRA model utilizes a specific projection architecture that pi-smart-router should replicate. Instead of a dense multi-layer perceptron (MLP) for requirement projection, HyDRA applies dropout to the [CLS] token representation and passes it through $K$ independent linear heads with sigmoid activations:

$$\hat{r}_k = \sigma(\mathbf{w}_k^\top \text{dropout}(\mathbf{h}_{[\text{CLS}]}) + b_k)$$

This produces independent requirement scores $\hat{r}_k \in [0,1]$ across distinct dimensions such as reasoning, code generation, debugging, and tool use. Model selection is then executed via **shortfall matching**. The router compares the predicted query requirements against configuration-defined model capabilities stored in a lightweight YAML registry. The algorithm selects the most economical model whose capability profile $c_k$ yields a shortfall $\max(0, \hat{r}_k - c_k)$ below a tunable threshold $\tau$.

This methodology fully decouples the routing network from specific model identities, allowing operators to ingest new models purely via YAML configuration updates without requiring any retraining of the neural weights.

---

## 4. Grounding Capability Scores and Dynamic Benchmarking

A significant limitation of the current pipeline is that model capability scores are static YAML/regex defaults. In a market where model capabilities evolve continuously, these priors must be grounded in objective, domain-specific benchmarks rather than heuristic estimates.

General-purpose benchmarks like MT-Bench or MMLU fail to predict performance in interactive, tool-using environments. The capability profiles for pi-smart-router must be derived from metrics that test autonomous execution:

| Benchmark | What it measures |
|-----------|------------------|
| **SWE-bench Verified** | Ability to resolve real GitHub issues autonomously; gold standard for full-repository software engineering and multi-file reasoning |
| **Terminal-Bench 2.0 / 2.1** | Ability to execute commands in a sandboxed terminal, configure environments, and react to standard error outputs; proxy for "tool use" and "debugging" dimensions |
| **LiveCodeBench** | Continuous streams of competitive programming challenges outside pre-training cutoff; isolates pure algorithmic "code generation" capabilities |

When updating the capability YAML, the ingestion of benchmark data should follow the methodology established by Microsoft's **Switchcraft** system. Switchcraft normalizes various function-calling datasets and evaluates candidate LLMs not by exact text matching, but by **Abstract Syntax Tree (AST) comparison** of the generated tool calls. This allows the system to recognize semantically equivalent tool arguments and accurately measure a model's true capability.

Integrating an automated script that periodically ingests the latest Terminal-Bench results, normalizes them via AST proxy metrics, and rewrites the YAML capability profiles will ensure the router's priors remain highly accurate.

---

## 5. Predicting $P(\text{success})$: Proxy Metrics and Calibration

At the "low-intensity gate" and the "HyDRA embedding matcher," pi-smart-router attempts to predict the probability that a cheaper model will succeed, denoted as $P(\text{success})$. In conversational interfaces, $P(\text{success})$ is often modeled via user preference (e.g., Chatbot Arena Elo). In agentic workflows, human preference is an insufficient signal; the system requires objective proxy metrics for task completion.

### Optimal Outcome Signals for Agent Trajectories

The most robust outcome signals for predicting agent success are derived from the execution environment itself:

- **Loop escalations and tool failure chains:** A sequence of identical, repeated tool errors (e.g., continually passing the wrong schema to a database query or failing to resolve a compilation error) is the strongest indicator of model failure.
- **Stop_reason length and validity:** If an agent terminates a loop without emitting a valid structured output or fulfilling the schema contract, the turn is classified as a failure.
- **Re-prompt rate / edit distance:** The frequency with which a user must manually intervene, reverse a commit, or issue a corrective prompt immediately following an agent's action serves as a negative reinforcement signal.

### Calibrating Uncertainty via Isotonic Regression

Raw predictive scores derived from structural heuristics or small embedding networks are notoriously miscalibrated; a raw network score of 0.85 rarely translates to an 85% empirical chance of success. To rectify this, pi-smart-router must adopt the calibration technique introduced in the **UCCI (Uncertainty-Calibrated Cascaded Inference)** framework.

UCCI maps raw margin uncertainty into a strict per-query error probability using isotonic regression. Isotonic regression is a non-parametric method that fits a monotonically increasing step function to minimize the Expected Calibration Error (ECE) using the pool-adjacent-violators algorithm.

Applied to pi-smart-router:

1. Collect a historical dataset of agent trajectories mapped to binary success labels.
2. Feed raw structural scores and HyDRA distances into an isotonic calibrator during an offline batch process.
3. Achieve dramatically reduced ECE (e.g., from 0.12 to 0.03 as demonstrated in UCCI research).

This ensures that when the router estimates $P(\text{success}) = 0.90$, the economical model will actually succeed 90% of the time, allowing for mathematically rigorous expected-cost thresholding.

---

## 6. Semantic Clustering: Outcome-Aware Tool Selection (OATS)

The current pipeline uses semantic clustering to generate tier hints, grouping reference prompts into static centroids (e.g., `low_stakes`, `deep_debug`). The known failure mode is false-high-confidence matches, where complex variations of a prompt land too close to a `low_stakes` centroid, causing an inappropriate downgrade.

To optimize this stage, pi-smart-router should integrate the principles of **OATS (Outcome-Aware Tool Selection)**, a technique designed for latency-constrained semantic routers. Instead of anchoring centroids to static, hand-curated reference prompts, OATS utilizes offline contrastive learning to shift embeddings based on empirical success rates.

During a periodic offline batch job, the system collects historical queries where the economical model was selected. It separates these into:

- A positive subset $Q^+$ (where the task succeeded)
- A negative subset $Q^-$ (where the agent failed or loop-escalated)

The centroid embedding $\mathbf{e}$ for the `low_stakes` cluster is then interpolated toward the positive outcomes and repulsed from the negative outcomes via momentum:

$$\hat{\mathbf{e}} = (1 - \alpha) \cdot \mathbf{e} + \alpha \cdot \mathbf{e}(Q^+) - \beta \cdot \mathbf{e}(Q^-)$$

In this formulation:

- $\alpha$ controls the attraction strength toward successful outcomes
- $\beta$ controls the repulsion strength from failures (typically $\beta < \alpha$ to account for asymmetric false-negative distributions)

This offline refinement requires zero additional parameters or inference latency at serving time. By actively repulsing the `low_stakes` centroid from prompts that historically triggered loop escalations, the router geometrically reshapes the embedding space to minimize false-positive cluster matches, drastically improving the precision of the low-intensity gate.

---

## 7. Subscription Economics and Quota-Aware Routing

Subscription models (such as Cursor Auto or Claude Pro) present a unique economic challenge: marginal API costs are zero, but the penalty for exhausting the monthly quota is a severe throttling of capabilities, often paired with steep overage charges if a "Max Mode" is enabled. A naive router that optimizes purely for marginal API cost will fail to manage subscription quotas effectively, allowing "free frontier" access to dominate selection until the quota collapses.

To manage quotas, pi-smart-router must implement **virtual cost modeling**, treating quota limits as a depleting resource within a finite-horizon Markov Decision Process (MDP), as proposed in the **SeqRoute** framework. SeqRoute demonstrates that treating routing as an MDP allows the agent to learn "delayed gratification"—conserving the premium quota during early, exploratory turns to preserve it for decisive, high-complexity synthesis turns later in the session.

The router must track the ratio of consumed quota to the time remaining in the billing cycle. As the quota becomes constrained, a dynamic multiplier $\lambda$ is applied to the threshold equation, exponentially increasing the virtual cost penalty for selecting the frontier tier.

To train this budget-aware mechanism without risking online quota exhaustion, the system should employ **Hindsight Budget Relabeling (HBR)**. By taking historical session logs and retrospectively simulating them under artificially tight quotas, HBR generates millions of offline transitions enriched with "bankruptcy" signals. Applying Conservative Q-Learning (CQL) to this dataset allows the router to automatically adapt its thresholding behavior based on the live state of the user's API quota.

---

## 8. Adversarial Robustness and Embedding Sanitization

Because pi-smart-router eschews heavy matrix factorization in favor of lightweight embedding matching, it inherits specific vulnerabilities to adversarial prompt injection. The most pressing threat to embedding-based routers is the **Route-to-Rome (R2A) attack**, an adversarial suffix optimization technique. Attackers use Greedy Coordinate Gradient (GCG) search to append mathematically optimized, seemingly nonsensical token strings to a prompt. These suffixes manipulate the geometric position of the query in the embedding space, artificially inflating its perceived complexity to forcefully bypass low-intensity gates and hijack expensive frontier models (resulting in denial-of-wallet attacks).

Furthermore, fingerprint spoofing attacks (such as **GhostPrint**) demonstrate that malicious models can be parameter-efficiently fine-tuned to mimic the outputs of stronger models, tricking downstream evaluators.

To achieve robustness without heavy runtime classifiers, pi-smart-router must implement structural sanitization and representation-level defenses:

### Length-Normalized Entropy Checks

Adversarial suffixes typically exhibit anomalous token entropy. The deterministic triage stage should analyze the cyclomatic complexity and token entropy of the input, rejecting or stripping suffixes that wildly violate natural language or code syntax distributions.

### Sparse Autoencoders (SAEs) as Filters

Recent research demonstrates that inserting a pre-trained Sparse Autoencoder into the residual stream of the embedding projection acts as a powerful defense against suffix optimization. The SAE acts as a sparse encode-decode operator, projecting the adversarial input onto a known, safe activation manifold. Because adversarial suffixes rely on exploiting highly specific, out-of-distribution geometric vectors, the SAE reconstructs the embedding while filtering out the adversarial noise, systematically neutralizing the attack before the vector reaches the shortfall gate.

---

## 9. Evaluation Methodology for Agent Routers

Evaluating an agentic router is fundamentally different from evaluating a chat router. Chat routers are evaluated on one-shot prompts. Agent routers must be evaluated on intermediate trajectory prefixes where a routing failure at step 4 may only manifest as a critical compilation error at step 10.

pi-smart-router should integrate its offline evaluation suite with **TwinRouterBench**. This benchmark explicitly tests step-level routing by providing router-visible prefixes derived from actual agent executions on SWE-bench and Terminal-Bench. The static track contains hundreds of intermediate states paired with an execution-verified target tier estimated under a strict downgrade-and-cascade protocol.

The evaluation pipeline must utilize **Counterfactual Routing Evaluation**. By holding out a set of verified execution traces, the router is tested not just on its ability to pick a model, but on whether the model it selects would have generated an Abstract Syntax Tree (AST) that matches the required tool call to progress the trajectory.

Furthermore, utilizing methodologies from **CodeRouterBench** (part of the Agent-as-a-Router framework), the evaluation should explicitly measure **cumulative regret**—the difference in cost and performance between the router's dynamic selections and the theoretical optimal choices known in hindsight.

---

## 10. Open-Source Ecosystem Comparison

A review of contemporary open-source routing architectures provides structural patterns that pi-smart-router can adapt or intentionally avoid.

| Router System | Primary Mechanism | Strengths | Relevance to pi-smart-router |
|---------------|-------------------|-----------|------------------------------|
| **Weave Router** | ONNX embeddings + Avengers-Pro clustering | Focuses on agentic session pinning and format translation caching | **High.** Validates cache-aware pinning and <50 ms proxy overhead |
| **Bifrost** | CEL expressions + deterministic governance | Ultra-low latency (<100 µs), strict virtual key budget enforcement | **Medium.** Excellent model for deterministic triage and quota fallback chains |
| **LiteLLM Router** | Python proxy + provider mapping | Broadest provider support, straightforward fallback orchestration | **Low.** Lacks native semantic routing; primarily a translation and logging layer |
| **NotDiamond** | Client-side recommendation layer | High accuracy via custom trained classifiers powering OpenRouter Auto | **Medium.** Validates predicting model identity; pi-smart-router prefers shortfall matching |
| **RouteLLM** | Matrix factorization over preference data | Strong benchmark performance on MT-Bench (85% savings) | **Low.** Vulnerable to confounder attacks; overly reliant on single-turn chat preference data |

---

## 11. Anti-Patterns to Avoid

The following practices must be explicitly avoided, backed by production evidence:

| Anti-pattern | Why it fails |
|--------------|--------------|
| **Per-turn unpinned switching** | Destroys KV-cache, turning a $0.30 operation into a $3.00 operation. Caching provides a 90% discount on input tokens; a router must calculate if the cheaper model's output rate offsets the loss of the input cache discount |
| **Generate-then-judge cascading for interactive agents** | FrugalGPT-style cascades add 500–2000 ms latency per step. For an agent making dozens of rapid tool calls, this tail latency is unacceptable |
| **Timestamping system prompts** | Injecting dynamic elements like `{{date}}` or random correlation IDs into the system prompt guarantees a cache miss on every request, nullifying routing savings |
| **Uncalibrated confidence thresholding** | Relying on raw model logprobs or raw spatial embedding distances without isotonic regression leads to massive over-escalation to the frontier model |

---

## 12. Gap Analysis vs. Existing Research

A comparison between the current pi-smart-router research (`docs/deep-research.md`) and the latest 2025–2026 literature reveals several critical shifts:

| Shift | Previous approach | New standard |
|-------|-------------------|--------------|
| **Evaluation scope** | MT-Bench and Chatbot Arena (one-shot) | TwinRouterBench, CodeRouterBench (step-level intermediate agent prefixes) |
| **Tool-call validation** | Exact string matching or LLM-as-a-judge | AST comparison (Switchcraft) for semantically identical tool invocations |
| **Quota management** | Simple rate-limiting | SeqRoute MDP formulation with Hindsight Budget Relabeling |
| **Model selection** | RouteLLM matrix factorization | Copilot HyDRA shortfall matching with YAML-based capability profiles |

---

## 13. Priority Ranking and Findings Table

| # | Area | Recommendation | Evidence | Pipeline Stage | Confidence | Implementation Effort |
|---|------|----------------|----------|----------------|------------|----------------------|
| 1 | Turn Envelope | Spawn unpinned ephemeral sub-agents for planning turns to preserve primary session context cache | Cursor/Weave architectures; KV cache economics (90% discount) | Turn Envelope → Session Pin | High | Moderate |
| 2 | HyDRA Fidelity | Upgrade from MiniLM to a distilled ModernBERT (e.g., Granite 97M) to support 8,192 token contexts | ModernBERT architecture; Granite ONNX performance | HyDRA Matcher | High | Low |
| 3 | Cluster Gate | Shift semantic centroids offline using OATS to fix false-positives | OATS contrastive embedding refinement | Low-Intensity Gate | High | Low |
| 4 | P(success) Labels | Calibrate raw scores to true error probabilities using isotonic regression over historical failure data | UCCI framework reducing ECE from 0.12 to 0.03 | Low-Intensity Gate / Triage | High | Moderate |
| 5 | Quota Economics | Model quotas as an MDP utilizing HBR for threshold decay | SeqRoute budget-aware offline RL | HyDRA Matcher / Safe Default | Medium | High |
| — | Capability Scores | Ingest SWE-bench/Terminal-Bench data via AST-checking to dynamically update the YAML registry | Switchcraft AST validation; Terminal-Bench evaluation | Local Zero-Tier / HyDRA | Medium | Moderate |
| — | Adversarial Defense | Apply SAE projections to the residual stream to neutralize R2A suffix attacks | R2A attack vectors; SAE defense efficacy | HyDRA Matcher | High | Moderate |

---

## 14. Proposed Calibration Roadmap

To safely transition pi-smart-router to this optimized architecture, the following calibration and deployment roadmap is recommended:

### Phase 1: Data Collection (Telemetry & Shadow Routing)

Deploy the router in a purely observational mode. Intercept all queries and route them to the user's default model, but asynchronously record the full trajectory, AST-verified tool calls, and the outputs of the proposed ModernBERT encoder. Ensure the prompt text is immediately discarded, storing only the 384-dimensional feature vectors and the ultimate trajectory outcome label (Success / Tool Failure Loop / Reprompt).

### Phase 2: Hindsight Relabeling & Label Generation

Apply Hindsight Budget Relabeling (HBR) to the collected traces to simulate quota exhaustion states. Calculate $P(\text{success})$ proxy labels based on observed loop escalations, edit distances, and stop reasons.

### Phase 3: Offline Training (OATS & Isotonic Regression)

Execute the periodic OATS batch job to shift the semantic cluster centroids toward successful historical embeddings. Fit the isotonic regression calibrator on a held-out validation set to map the raw spatial distances to accurate error probabilities with minimized ECE.

### Phase 4: Offline Evaluation (Counterfactual Replay)

Run the updated routing policy against the TwinRouterBench static track and custom counterfactual traces to guarantee that the new policy achieves an optimal Pareto frontier (matching task resolution while minimizing virtual cost) without triggering adversarial degradation.

### Phase 5: Shadow Deploy & Gradual Rollout

Re-enable active routing in the pipeline, beginning with a strict fallback threshold that heavily favors frontier models. Gradually relax the shortfall parameter $\tau$ using the calibrated $P(\text{success})$ data until the target cost-latency-accuracy optimization is achieved across the fleet.

---

## 15. Annotated Bibliography

Below is a curated selection of primary sources investigated for this report, tagged by relevance to specific pipeline stages and architectural abstractions.

### Architecture & HyDRA

- **Garg et al. (2026). HyDRA: Hybrid Dynamic Routing Architecture.** Details GitHub Copilot's shift to a multi-dimensional capability predictor (ModernBERT) and config-decoupled shortfall matching. *[Architecture, HyDRA]*
- **HyDRA Repository/Config Docs.** Outlines the specific K=4 independent sigmoid heads (reasoning, code generation, debugging, tool use) used in ModernBERT for shortfall matching. *[Architecture, HyDRA]*
- **HyDRA ArXiv Preprint v2.** Focuses on the tunable shortfall threshold enabling iso-quality matching at 54.1% cost savings without retraining weights when models update. *[Evaluation, HyDRA]*
- **HyDRA Methodology.** Describes the 7-flag signal prefix and the exclusion of prior assistant responses to keep inference cheap during the routing phase. *[Architecture, Turn Envelope]*
- **HyDRA Shortfall Formula.** Details the exact binary cross-entropy loss and dimension-specific weights used in the shortfall matching algorithm. *[Mathematics, HyDRA]*
- **HyDRA YAML Profiles.** Explains how model capability profiles live in configuration, totally decoupled from the learned weights of the ModernBERT encoder. *[Architecture, Capability]*
- **HyDRA Cross-lingual Consistency.** Documents the first LLM-pool router to demonstrate language-invariant routing across CJK and European scripts. *[Evaluation, HyDRA]*

### Turn Envelope & Session Pinning

- **Not Diamond (2026). A Comprehensive Guide to Model Routing.** Explores sub-agent level routing versus session-level routing, validating the need to break complex tasks away from pinned sessions. *[Architecture, Turn Envelope]*
- **Zhang et al. (2026). MTRouter: Cost-Aware Multi-Turn LLM Routing with History-Model Joint Embeddings.** Proves multi-turn routing can make fewer unnecessary model switches than reactive single-turn routers. *[Architecture, Session Pin]*
- **Weave Router Engineering Blog.** Details the necessity of session pinning to compound cache hits, only breaking the pin when the swap is cheaper than the cache warmup cost. *[Caching, Session Pin]*
- **Augment Cosmos & Prism.** Evaluates caching models, noting that enterprise deployments rely on cache-aware switching across model families. *[Caching, Session Pin]*
- **Weave Router Deep Dive.** A critical analysis showing that a naive per-turn router destroys prompt caching, which is economically fatal for agentic workflows. *[Caching, Session Pin]*
- **Cache Optimization in Harnesses.** Developer feedback indicating that proxy models break control loops, advocating for clean sub-agent spawning instead. *[Architecture, Turn Envelope]*
- **Weave Router Envelope Mechanics.** Describes lazy parsing of requests to skip JSON round-trips, embedding with ONNX, and top-p selection. *[Architecture, Turn Envelope]*

### Triage & Deterministic Routing

- **Bifrost Open Source Gateway.** Details a sub-100 µs AI gateway utilizing CEL expressions for deterministic routing rules. *[Architecture, Triage]*

### Economics & Quota

- **Not Diamond Routing Mechanics.** Explores predictive model routing powering OpenRouter's auto mode, utilizing a virtual cost architecture. *[Economics, Quota]*
- **LLMAPI.ai Guide.** Discusses virtual keys, budget controls, and cost-visibility guardrails for multi-model routing deployments. *[Economics, Quota]*
- **Perplexity Quota-Aware Routing.** Outlines subscription tiers and rate limits, illustrating the need for smart routing based on pool limits. *[Economics, Quota]*
- **Xu et al. (2026). SeqRoute.** Formalizes multi-turn LLM routing as a finite-horizon MDP incorporating remaining session budget. *[Economics, SeqRoute]*
- **Hindsight Budget Relabeling (HBR).** Details retrospectively simulating historical trajectories under hypothetical budgets to train CQL agents. *[Economics, SeqRoute]*

### Evaluation & Benchmarks

- **AI Weekly on Weave Router.** Corroborates that 60–70% of production Claude Code requests are short completions viable for open-source parity. *[Evaluation, Viability]*
- **Terminal-Bench 2.0.** Introduces a curated hard benchmark of 89 interactive computer terminal environments for evaluating agentic coding. *[Evaluation, Benchmarks]*
- **Terminal-Bench Verification Protocol.** Describes the specificity, solvability, and integrity checks used to prevent agents from taking non-real-world shortcuts. *[Evaluation, Benchmarks]*
- **Artificial Analysis Terminal-Bench v2.1.** Details the leaderboard showing GPT-5.5 Codex CLI scoring 83.4%, establishing the frontier baseline. *[Evaluation, Benchmarks]*
- **RouteLLM Robustness Study.** Analyzes the fragility of preference-data-based routers on simple queries. *[Evaluation, Vulnerability]*
- **MTRouter Evaluation (ScienceWorld & HLE).** Demonstrates that MTRouter reduces total cost by 58.7% over GPT-5 while showing emergent specialization across tools. *[Evaluation, Multi-turn]*
- **Kassem et al. (2026). How Robust Are Router-LLMs?** Exposes the tendency of BERT-based routers to direct all coding/math queries to the most powerful LLM regardless of difficulty. *[Security, Evaluation]*
- **Switchcraft Evaluation Framework.** Details the distillation of preference data into a DistilBERT classifier for agentic tool calling. *[Evaluation, Switchcraft]*
- **CodeRouterBench / ACRouter.** Introduces an evaluation environment with ~10K streaming task instances to measure regret-based router comparison. *[Evaluation, CodeRouterBench]*
- **TwinRouterBench.** A step-level routing benchmark exposing router-visible prefixes to test if cheaper replacements preserve downstream task success. *[Evaluation, TwinRouterBench]*

### P(success) Metrics

- **Multi-Agent Orchestration Survey.** Examines coordination failures (contradictions, duplicate effort) as the dominant cause of system-level degradation. *[Metrics, P(success)]*
- **Self-Evolving Agents.** Outlines the need for enterprise-grade data proxies that capture trajectories across memory systems and human-feedback channels. *[Metrics, P(success)]*
- **StackAI Agent Evaluation Guide.** Recommends tracking tool calling accuracy; many failures are tooling failures (wrong endpoint/field) rather than reasoning failures. *[Metrics, P(success)]*
- **MTRouter Architecture.** Explains the error-aware adjustment mapping history-model pairs to an estimate of eventual episode outcome. *[Metrics, P(success)]*
- **Kotte (2026). UCCI: Calibrated Uncertainty for Cost-Optimal LLM Cascade Routing.** Demonstrates using isotonic regression to map token-level margin uncertainty to error probability. *[Metrics, UCCI]*

### OATS & Semantic Clustering

- **Chen et al. (2026). Outcome-Aware Tool Selection (OATS).** Proposes interpolating tool embeddings toward positive-outcome centroids to refine semantic routers offline without inference latency. *[Architecture, OATS]*
- **OATS Latency Constraints.** Formalizes the latency-accuracy tradeoff, showing OATS improves NDCG@5 from 0.869 to 0.940 on MetaTool. *[Architecture, OATS]*
- **OATS Contrastive Learning.** Provides the exact formula for blending embeddings with momentum to avoid oscillation during centroid interpolation. *[Mathematics, OATS]*
- **GroundedCache / mtRAG Study.** Explains the use of Jaccard similarity and semantic cache routing gates to maintain safety in RAG systems. *[Caching, Semantic Gate]*
- **Weave Router Go Implementation.** Highlights the use of an in-process ONNX model for scoring against frozen cluster centroids in under 50 ms. *[Architecture, Clusters]*

### Encoders

- **ModernBERT Architecture Review.** Explains sequence packing, RoPE scaling, and alternating local/global layers allowing 8192-token context windows. *[Architecture, Encoders]*
- **Granite Embedding Multilingual R2.** IBM's 97M-parameter ModernBERT-based embedder outperforming MiniLM, optimized for CPU ONNX inference. *[Architecture, Encoders]*

### Security & Adversarial

- **Sun et al. (2026). Fingerprint Spoofing in LLMs.** Introduces GhostPrint, detailing how malicious providers fine-tune weak models to spoof fingerprints. *[Security, Adversarial]*
- **Tang et al. (2026). Route to Rome Attack.** Details adversarial suffix optimization using a hybrid ensemble surrogate router to force escalation to expensive models. *[Security, R2A]*
- **Adversarial Suffix Generation.** Explains the discrete optimization method (Greedy Coordinate Gradient) that appends token sequences to induce unsafe outputs. *[Security, R2A]*
- **R2A Hybrid Ensemble Surrogate.** Explains how R2A mimics black-box routers to significantly increase the routing rate to expensive models. *[Security, R2A]*
- **Sparse Autoencoders for Defense.** Demonstrates that SAE routing systematically reduces attack transferability by acting as a sparse encode-decode operator on the residual stream. *[Security, SAE]*

### Cascades & Architecture Tradeoffs

- **Cascade Routing Unified Optimization.** ETH Zurich paper analyzing the tradeoff between latency taxes in cascading versus classification accuracy in upfront routing. *[Architecture, Cascades]*

### Switchcraft & AST Validation

- **Switchcraft (Microsoft).** Introduces an AST-based comparison framework to statically label tool calls for agentic fine-tuning and routing. *[Evaluation, Switchcraft]*

### Project Documentation

- **pi-smart-router Documentation.** Outlines the current pipeline, including the turn envelope, context-fit gate, and deterministic triage steps. *[Architecture, Pipeline]*

---

*This report is provided for informational and architectural design purposes within the context of software engineering and LLM infrastructure. It does not constitute individualized medical, legal, or safety-critical advice.*
