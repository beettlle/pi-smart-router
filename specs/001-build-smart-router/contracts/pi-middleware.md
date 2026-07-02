# Contract: pi Extension Integration

**Feature**: 001-build-smart-router | **Version**: 1.0.0  
**Status**: Final

## Purpose

Document the field mapping from pi.dev extension events to [routing-request.schema.json](./routing-request.schema.json). The router integrates as a pi extension (not a standalone HTTP middleware). US3 turn envelope (T029) consumes this contract.

## Integration Surface

The router extension registers handlers on pi extension events:

| pi event | Router use |
|----------|------------|
| `before_provider_request` | Primary routing hook; inspect/replace provider payload with selected model |
| `context` | Read current `messages` envelope for turn classification |
| `session_before_compact` / `session_compact` | Set `compaction_flag` for pin-break on next routing decision |
| `model_select` | Capture operator override when `event.source === "set"` |

Reference: pi-coding-agent `docs/extensions.md` (`before_provider_request`, `context`, `session_compact`, `model_select`).

## Field Mapping

| RoutingRequest field | pi source | Required | Notes |
|---------------------|-----------|----------|-------|
| `session_id` | `ctx.sessionManager.getSessionFile()` or fallback `sha256(cwd + sessionManager.getSessionId())` | yes | Stable across multi-turn session; ephemeral in-memory sessions use hashed fallback |
| `messages` | Latest `context` event `messages` (deep copy) | no | Role + content + tool blocks; drives `turn_type` derivation |
| `compaction_flag` | `true` on first routing decision after `session_compact` / `session_before_compact` | no | Triggers session pin break |
| `force_model_id` | `model_select` event when `event.source === "set"` → `${event.model.provider}/${event.model.id}` | no | Sets pin_reason `user_forced` |
| `request_id` | Generated UUID per routing decision | yes | New UUID each `before_provider_request` |
| `prompt_text` | Last user message content from `messages`, or `before_agent_start.prompt` when available | yes | Sanitized before scoring |

## Session ID Strategy

1. **Persisted session:** Use absolute path from `ctx.sessionManager.getSessionFile()`.
2. **Ephemeral session:** When `getSessionFile()` returns `undefined`, derive `session_id` as `sha256(ctx.cwd + ":" + ctx.sessionManager.getSessionId())`.
3. **Cross-process:** Same session file path MUST produce the same `session_id` for SQLite pin sharing (FR-025).

## Turn Type Derivation

From `messages` envelope when `turn_type` is absent:

| Condition | Derived `turn_type` |
|-----------|---------------------|
| Planning or architecture role/content | `planning` |
| Tool result payload below size threshold | `tool_result` |
| Subagent or exploration context | `subagent` |
| Default agent loop turn | `main_loop` |
| Unclassifiable | `unknown` |

## Routing Hook Behavior

On `before_provider_request`:

1. Build `RoutingRequest` from mapping table above.
2. Run router pipeline synchronously.
3. Return modified payload selecting the routed model/provider, preserving cache markers on same-provider paths (FR-023).
4. On pipeline failure, apply `safeCloudDefault()` without throwing (FR-022).

## References

- [research.md](../research.md) §10
- [data-model.md](../data-model.md) RoutingRequest
- Task T021 / T021b in [tasks.md](../tasks.md)
- pi extensions: `before_provider_request`, `ExtensionContext.sessionManager`
