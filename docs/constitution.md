# pi-smart-router — Constitution

**Last Updated:** 2026-07-02  
**Spec-kit mirror:** `.specify/memory/constitution.md` v1.1.0

Upstream principles for this project. Edit this file before decomposing work into spine task packets. Agents load it via `referenceDocs` in `.spine/spine-config.json`.

---

## Mission

pi-smart-router is an open-source auto-model router for the pi.dev coding agent ecosystem. It intercepts each LLM request and selects the best execution tier (local, economical cloud, or frontier cloud) to balance cost, capability, latency, and time-to-first-token without manual model picking by the developer.

---

## Guiding principles

### Routing domain (non-negotiable)

1. **Predictive pre-generation routing** — Route before generation; no post-generation output judging. Observational loop escalation on repeated tool failures is allowed.
2. **Input integrity** — Sanitize adversarial confounder patterns; validate external input at boundaries.
3. **Cache-aware session pinning** — Pin per session; break only at compaction, override, loop escalation, or cache-warmup economics.
4. **Configuration-decoupled matching** — Fleet catalog changes must not require retraining the matcher.
5. **Multi-objective agentic routing** — At quality parity, optimize cost, latency, and verbosity; turn-type signals within pin rules.
6. **Zero-crash resilience** — Degrade to safe cloud default; never crash the host agent.
7. **Latency-budget discipline** — Deterministic fast-path before neural inference; bounded stages and queues.

### Engineering (from project rules)

8. **Simplicity** — Delete before abstract; no ghost layers or God objects; boring proven tech wins.
9. **Core logic first** — Domain pipeline and tests before integration glue or operator UX.
10. **Make it work, make it right, make it fast** — Correctness before micro-optimization; measure hot paths.
11. **Fail fast, fail loud** — Propagate errors with context; no silent failures; fail secure by default.

### Testing and verification

- Every behavior change includes a test or explicit verification step in the task contract.
- Run the project's test command before marking work complete.
- Do not claim tests pass without evidence.
- Test error paths: provider outage, local unavailable, parse failure, rate limit, pin break.

### User experience

- Optimize for the operator and end-user path, not internal convenience.
- Failures must be visible, actionable, and safe by default.
- Routing explainability and per-request telemetry are first-class operator features.

### Performance

- Avoid I/O in loops; batch reads and writes.
- Parallelize independent probes; sequential pipeline stages only where order matters.
- Measure before optimizing hot paths; no full-fleet scans for single-request routing.

### Security

- No secrets in source control.
- Validate untrusted input at system boundaries.
- Safe model artifact loading; no weights in git; no untrusted deserialization.

### TypeScript / Node implementation

- Strict TypeScript; ban `any` on routing paths.
- ES modules; explicit async error handling.
- Intention-revealing names; minimal exported API surface.

### ML inference path

- Validate embedding shapes before scoring.
- Inference without gradients; bounded memory use.
- Log routing experiments for reproducibility; seed RNG in stochastic tests.

---

## Non-negotiable rules

1. **Scope discipline** — Task workers stay within PROMPT File Scope unless the operator amends the packet.
2. **No silent failures** — Errors propagate with context; do not swallow exceptions.
3. **Honest verification** — Build and test claims require output or "verification pending."
4. **Reversibility** — Prefer changes that can be reverted without data loss.
5. **No placeholder production code** — Implement, remove, or mark unavailable with explanation.
6. **Verify dependencies** — Confirm packages and APIs exist before importing; prevent slopsquatting.
7. **Business logic location** — Routing rules in domain pipeline; gateways and stores are transport/persistence only.

---

## How this file is used

| Consumer | Usage |
|----------|-------|
| Task authoring | Mission and "Context to Read First" in `PROMPT.md` |
| Workers | Injected when listed in `referenceDocs` (not in `neverLoad`) |
| Reviewers | Principles inform plan/code review; reviewers do not auto-load `referenceDocs` |
| `/spec:constitution` | Keep in sync with `.specify/memory/constitution.md` |

Rule sources: `.cursor/rules/engineering-philosophy.mdc`, `general-llm-anti-patterns.mdc`, `ai-ml-development-standards.mdc`, `javascript-3-development-standards.mdc`, `owasp-secure-coding-practices.mdc`.
