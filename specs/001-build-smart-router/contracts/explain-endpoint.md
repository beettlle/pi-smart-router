# Contract: Explain Endpoint

**Feature**: 001-build-smart-router | **Version**: 1.0.0

## Purpose

Return routing rationale without dispatching upstream inference. Used for operator audit, shadow runs, and SC-010 parity validation.

## HTTP

```
POST /v1/route/explain
Content-Type: application/json
```

### Request Body

Conforms to [routing-request.schema.json](./routing-request.schema.json).

### Response 200

Conforms to [routing-decision.schema.json](./routing-decision.schema.json).

Must be **bit-for-bit equivalent** to the decision the live pipeline would produce for the same input and session state at request time.

### Response 400

Invalid request schema.

```json
{
  "error": "validation_failed",
  "details": []
}
```

### Response 503

Router unavailable; MUST NOT crash caller. Returns safe default decision in body with `stage: "fallback"`.

## CLI (planned)

```
pi router explain [--session-id ID] [--payload FILE]
```

Stdout: JSON matching RoutingDecision schema.

## Invariants

- MUST NOT call upstream LLM providers
- MUST read current session pin state (same as live path)
- MUST emit no RoutingTelemetry with upstream cost (routing_latency_ms only)
- `candidates` SHOULD include top 3 alternatives when stage is `hydra_match`

## Reason Codes (canonical set)

| Code | Stage | Meaning |
|------|-------|---------|
| `keyword_economical` | triage | Lexical match to trivial intent |
| `keyword_frontier` | triage | Lexical match to complex intent |
| `cyclomatic_high` | triage | AST score > threshold |
| `turn_planning` | turn_envelope | Planning turn bias |
| `turn_tool_result` | turn_envelope | Tool result sub-routing |
| `pin_hit` | session_pin | Valid pin; bypassed matching |
| `pin_break_compaction` | session_pin | Compaction triggered re-route |
| `pin_break_loop_escalation` | session_pin | Loop rescue escalated tier |
| `local_ready` | local_zero | Loaded local model available |
| `local_unavailable` | local_zero | Fallback to cloud |
| `hydra_best_score` | hydra_match | Multi-objective winner |
| `safe_default` | fallback | Error or total pipeline failure |

## Context-fit observability (SP-110)

When the context-fit gate runs, `features.context_fit` MAY be present on the routing decision:

| Field | Type | Meaning |
|-------|------|---------|
| `estimated_input_tokens` | number \| null | Token estimate used by the gate |
| `context_fit_viable_count` | number \| null | Fleet models whose window fits the estimate |
| `context_fit_rejected_json` | string \| null | JSON array of `{ model_id, max_input_tokens, reason }` rejections |
| `context_overflow_pin_break` | boolean | Pin broke or overflow fallback escalated |
| `selected_model_max_input_tokens` | number \| null | Declared input limit for selected model |
| `context_fit_reason_code` | string \| null | `context_fit_pass`, `context_fit_rejected_all`, `context_overflow_pin_break`, or overflow fallback variant |

Rejected models also appear in `features.candidates` with `rejected_reason: "context_fit_exceeded"`.

## Tier/cluster selection observability (SP-113)

When the low-intensity tier gate runs, `features.tier_selection` MAY be present on the routing decision:

| Field | Type | Meaning |
|-------|------|---------|
| `cluster_id` | string \| null | Nearest routing cluster id |
| `cluster_similarity` | number \| null | Cosine similarity to best cluster |
| `cluster_margin` | number \| null | sim(best) − sim(second) |
| `low_intensity_score` | number \| null | Combined structural low-intensity score |
| `tier_hint` | string \| null | Suggested tier before HyDRA / pin |
| `p_success_cheap` | number \| null | P(success) on economical tier |
| `local_eligible_reason` | string \| null | Why local_zero eligibility passed |
| `tier_selection_reason_code` | string \| null | Normalized reason: `cluster_{id}`, `low_intensity_structural`, `high_intensity_structural`, `p_success_cheap`, `p_success_uncertain` |
| `cluster_match_table` | array \| null | All cluster centroids with scores (when cluster matcher wired) |
| `tier_feature_summary` | object \| null | Triage and requirement vector summary |
| `low_intensity_breakdown` | object \| null | Score, hint, P(success), and rejected expected-cost tiers |
| `local_zero_skip_reasons` | string[] | Why local_zero did not dispatch when another stage won |

`SMART_ROUTER_LOG_ROUTING=1` JSON lines include `cluster_summary` with cluster id, similarity, margin, tier hint, and tier-selection reason code.
