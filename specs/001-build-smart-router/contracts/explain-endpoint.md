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
